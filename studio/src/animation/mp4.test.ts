// @vitest-environment happy-dom
// The MP4 writer (M4 spec §5, §10.1): frames drawn in order and awaited, the probe asks what the encode uses, Cancel saves nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { neutralPose } from 'noxy-src/brain/pose.ts';
import { PERSONALITIES } from 'noxy-src/brain/personality.ts';
import { DEFAULT_LOOK, nox } from 'noxy-src/character/nox/index.ts';
import type { Look } from 'noxy-src/character/types.ts';
import { canMakeMp4, frameSvg, makeMp4, mediabunnySink, type VideoSink } from './mp4.ts';

vi.mock('mediabunny', () => {
  class Quality {
    level: string;
    constructor(level: string) {
      this.level = level;
    }
  }
  const seen: Record<string, unknown> = {};
  return {
    seen,
    Quality,
    canEncodeVideo: async (codec: string, o: object) => ((seen.probe = { codec, ...o }), true),
    Mp4OutputFormat: class {},
    BufferTarget: class {},
    Output: class {
      target = { buffer: new ArrayBuffer(4) };
      addVideoTrack(_: unknown, o: object) {
        seen.track = o;
      }
      start = async () => {};
      finalize = async () => {};
      cancel = async () => {};
    },
    CanvasSource: class {
      constructor(_: unknown, o: object) {
        seen.source = o;
      }
      add = async () => {};
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Fake Blob URLs that keep each blob, so a test can read the SVG a frame was drawn from. */
function urls() {
  const blobs: Blob[] = [];
  const revoked: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => `blob:${blobs.push(b as Blob)}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => void revoked.push(u));
  return { blobs, revoked };
}
/** An Image that loads at the fitted 1080 frame size as soon as its src is set. */
const fakeImage = () =>
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 1080;
      naturalHeight = 910;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
/** A canvas whose 2D context logs what is drawn; `alpha` is what getImageData reads back. */
function fakeCanvas(log: string[], alpha = 0) {
  const ctx = {
    fillStyle: '',
    fillRect: (...a: number[]) => log.push(`fill ${ctx.fillStyle} ${a.join(' ')}`),
    drawImage: (_: unknown, x: number, y: number) => log.push(`draw ${x} ${y}`),
    getImageData: () => ({ data: [0, 0, 0, alpha] }),
  };
  const make = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx } : make(tag)) as typeof document.createElement);
}
/** A sink that logs each add (start and end, so awaiting shows) and can be told to stall. */
function fakeSink(log: string[]) {
  const sink: VideoSink = {
    add: async (t, d) => {
      log.push(`add ${t.toFixed(4)} ${d.toFixed(4)}`);
      await new Promise((resolve) => setTimeout(resolve)); // slower than a paint, so an add that isn't awaited shows
      log.push('added');
    },
    finish: vi.fn(async () => new Blob(['mp4'])),
    cancel: vi.fn(async () => {}),
  };
  return { sink, factory: async () => sink };
}

describe('frameSvg', () => {
  it('sizes the frame to fit the square and draws the pose', () => {
    const svg = frameSvg(DEFAULT_LOOK, 'blur', 1080)(neutralPose());
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="910"');
    expect(svg).toMatch(/id="eye-l-shape"[^>]*\sd="M/);
  });
  it('draws every part combination and custom colours (Review Focus 1)', () => {
    for (const body of nox.parts.body)
      for (const ears of nox.parts.ears)
        for (const bolts of nox.parts.bolts) {
          const look: Look = { ...DEFAULT_LOOK, body: body.id, ears: ears.id, bolts: bolts.id, theme: { base: { shell: '#112233', screen: '#223344', eye: '#ffffff', accent: '#ff8800', mouth: '#eeeeee' } } };
          expect(() => frameSvg(look, 'halo', 512)(neutralPose()), `${body.id} ${ears.id} ${bolts.id}`).not.toThrow();
        }
  });
  it('the halo rig has no filter', () => {
    const svg = frameSvg(DEFAULT_LOOK, 'halo', 512)(neutralPose());
    expect(svg).toContain('id="halo"');
    expect(svg).not.toContain('soft-glow');
  });
});

describe('makeMp4', () => {
  const job = { frames: [neutralPose(), neutralPose(), neutralPose()], look: DEFAULT_LOOK, size: 1080, background: '#123456', glow: 'blur' as const };

  it('paints the background, centres the frame, and adds each frame in order, awaited', async () => {
    const log: string[] = [];
    const { revoked, blobs } = urls();
    fakeImage();
    fakeCanvas(log);
    const { factory } = fakeSink(log);
    const progress: number[] = [];
    await makeMp4(job, new AbortController().signal, (d) => progress.push(d), factory);
    expect(log).toEqual([
      'fill #123456 0 0 1080 1080', 'draw 0 85', 'add 0.0000 0.0167', 'added',
      'fill #123456 0 0 1080 1080', 'draw 0 85', 'add 0.0167 0.0167', 'added',
      'fill #123456 0 0 1080 1080', 'draw 0 85', 'add 0.0333 0.0167', 'added',
    ]);
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
    expect(revoked).toHaveLength(blobs.length);
  });

  it('Cancel works while a frame is stuck in the encoder, and releases it', async () => {
    const log: string[] = [];
    urls();
    fakeImage();
    fakeCanvas(log);
    const { sink, factory } = fakeSink(log);
    sink.add = vi.fn(() => new Promise<void>(() => {})); // an encoder that never takes the frame (Safari's 'quality' mode)
    const ac = new AbortController();
    const made = makeMp4(job, ac.signal, () => {}, factory).then(
      () => 'finished',
      () => 'stopped',
    );
    await vi.waitFor(() => expect(sink.add).toHaveBeenCalled());
    ac.abort();
    expect(await Promise.race([made, new Promise((r) => setTimeout(() => r('still waiting'), 200))])).toBe('stopped');
    expect(sink.cancel).toHaveBeenCalledOnce();
  });

  it('Cancel stops between frames, cancels the encoder and makes no file', async () => {
    const log: string[] = [];
    urls();
    fakeImage();
    fakeCanvas(log);
    const { sink, factory } = fakeSink(log);
    const ac = new AbortController();
    await expect(makeMp4(job, ac.signal, (d) => d > 0.3 && ac.abort(), factory)).rejects.toThrow();
    expect(log.filter((l) => l.startsWith('add '))).toHaveLength(1);
    expect(sink.cancel).toHaveBeenCalledOnce();
    expect(sink.finish).not.toHaveBeenCalled();
  });
});

describe('the encoder', () => {
  it('the probe asks about exactly what the encode uses (spec §5)', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    expect(await canMakeMp4(1080)).toBe(true);
    await mediabunnySink(document.createElement('canvas'));
    const { seen } = (await import('mediabunny')) as unknown as { seen: Record<string, unknown> };
    // realtime: Safari's encoder in the default 'quality' mode never outputs a frame, so the export hung at 0 %.
    expect(seen.probe).toMatchObject({ codec: 'avc', width: 1080, height: 1080, frameRate: 60, quality: { level: 'high' }, latencyMode: 'realtime' });
    expect(seen.source).toMatchObject({ codec: 'avc', quality: { level: 'high' }, latencyMode: 'realtime' });
    expect(seen.track).toEqual({ frameRate: 60 });
  });
  it('no VideoEncoder, no MP4', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    expect(await canMakeMp4(1080)).toBe(false);
  });
});

describe('the blur probe', () => {
  it('reads a pixel only a blur reaches, once per page', async () => {
    vi.resetModules();
    const { blurWorks } = await import('./mp4.ts');
    urls();
    fakeImage();
    const log: string[] = [];
    fakeCanvas(log, 120);
    expect(await blurWorks()).toBe(true);
    expect(await blurWorks()).toBe(true);
    expect(log.filter((l) => l.startsWith('draw'))).toHaveLength(1);
  });
  it('uses the halo rig when the blur probe fails (Review Focus 5)', async () => {
    vi.resetModules();
    const { exportMp4 } = await import('./mp4.ts');
    const { blobs } = urls();
    fakeImage();
    const log: string[] = [];
    fakeCanvas(log, 0);
    const { factory } = fakeSink(log);
    const req = { look: DEFAULT_LOOK, dials: { ...PERSONALITIES.default }, speed: 4, seed: 1, state: 'idle' as const, event: null, gaze: null, size: 512, background: '#000000' };
    await exportMp4(req, new AbortController().signal, () => {}, factory);
    const frame = await blobs[blobs.length - 1].text();
    expect(frame).toContain('id="halo"');
    expect(frame).not.toContain('soft-glow');
  });
});
