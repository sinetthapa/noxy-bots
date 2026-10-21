// MP4 export (M4 spec §5): each pose drawn on a detached rig, rasterized through an Image onto a square canvas with a
// background, and encoded as H.264 at 60 fps by Mediabunny, which loads only when an export needs it.
import { DEFAULT_TUNING } from 'noxy-src/brain/tuning.ts';
import type { Pose } from 'noxy-src/brain/pose.ts';
import { buildRig } from 'noxy-src/character/build.ts';
import { resolveLook } from 'noxy-src/character/look.ts';
import { nox } from 'noxy-src/character/nox/index.ts';
import type { Look } from 'noxy-src/character/types.ts';
import { createSvgRenderer } from 'noxy-src/render/svg.ts';
import { loadImage } from '../export.ts';
import { record, type ClipSpec } from './record.ts';

export const FPS = 60;
export type Glow = 'blur' | 'halo';
export interface Mp4Request extends ClipSpec {
  look: Look;
  size: number;
  background: string;
}

/** Draws poses onto one detached rig and returns each frame as SVG text, sized to fit a size × size square. */
export function frameSvg(look: Look, glow: Glow, size: number): (pose: Pose) => string {
  const svg = new DOMParser().parseFromString(buildRig(nox, look, { glow }), 'image/svg+xml').documentElement as unknown as SVGSVGElement;
  const [, , w, h] = nox.frame;
  const k = size / Math.max(w, h);
  svg.setAttribute('width', String(Math.round(w * k))); // rasterized at this size, so the frame is sharp
  svg.setAttribute('height', String(Math.round(h * k)));
  const renderer = createSvgRenderer(svg, resolveLook(nox, look), DEFAULT_TUNING);
  const xml = new XMLSerializer();
  return (pose) => {
    renderer.draw(pose);
    return xml.serializeToString(svg);
  };
}

/** One frame: the background, then the SVG centred at its own (fitted) size. */
async function paint(ctx: CanvasRenderingContext2D, svg: string, size: number, background: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (size - img.naturalWidth) / 2, (size - img.naturalHeight) / 2);
  } finally {
    URL.revokeObjectURL(url);
  }
}

let blur: Promise<boolean> | undefined;
/** Whether this browser keeps the rig's glow filter when it draws an SVG through an Image (Q15 a). Asked once per page. */
export function blurWorks(): Promise<boolean> {
  return (blur ??= (async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><filter id="g" x="-150%" y="-150%" width="400%" height="400%">' +
      '<feMorphology operator="dilate" radius="5"/><feGaussianBlur stdDeviation="12"/></filter><circle cx="30" cy="30" r="5" filter="url(#g)"/></svg>';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    await paint(ctx, svg, 60, 'transparent');
    return ctx.getImageData(45, 30, 1, 1).data[3] > 0; // 15 px from the dot's centre: only the glow reaches it
  })().catch(() => false));
}

/** The encode settings; the probe asks about exactly these (spec §5). */
const CODEC = 'avc';
const LEVEL = 'high';
// Safari's H.264 encoder in the default 'quality' mode takes frames but never outputs one, not even on flush (Safari 27.2).
const LATENCY = 'realtime';

/** Whether this browser can encode the MP4 at this size. */
export async function canMakeMp4(size: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  const m = await import('mediabunny');
  return m.canEncodeVideo(CODEC, { width: size, height: size, frameRate: FPS, quality: new m.Quality(LEVEL), latencyMode: LATENCY });
}

/** Where frames go: Mediabunny in the app, a fake in tests. */
export interface VideoSink {
  add(timestamp: number, duration: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
}
export type SinkFactory = (canvas: HTMLCanvasElement) => Promise<VideoSink>;

export const mediabunnySink: SinkFactory = async (canvas) => {
  const m = await import('mediabunny');
  const output = new m.Output({ format: new m.Mp4OutputFormat(), target: new m.BufferTarget() });
  const source = new m.CanvasSource(canvas, { codec: CODEC, quality: new m.Quality(LEVEL), latencyMode: LATENCY });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  return {
    add: (t, d) => source.add(t, d), // awaited by the caller: it holds back when the encoder is busy
    async finish() {
      await output.finalize();
      return new Blob([output.target.buffer!], { type: 'video/mp4' });
    },
    cancel: () => output.cancel(),
  };
};

/** Rejects as soon as the signal aborts, so Cancel answers even while a step hangs (a stalled encoder, say). */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    if (signal.aborted) return stop();
    signal.addEventListener('abort', stop, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** Encodes the frames, reporting progress (0–1); Cancel stops at once and cancels the encoder. */
export async function makeMp4(
  job: { frames: Pose[]; look: Look; size: number; background: string; glow: Glow },
  signal: AbortSignal,
  onProgress: (done: number) => void,
  sink: SinkFactory = mediabunnySink,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = job.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D canvas');
  const frame = frameSvg(job.look, job.glow, job.size);
  const out = await sink(canvas);
  try {
    for (let i = 0; i < job.frames.length; i++) {
      signal.throwIfAborted();
      await untilAborted(paint(ctx, frame(job.frames[i]), job.size, job.background), signal);
      await untilAborted(out.add(i / FPS, 1 / FPS), signal);
      onProgress((i + 1) / job.frames.length);
    }
    signal.throwIfAborted();
    return await untilAborted(out.finish(), signal);
  } catch (e) {
    void out.cancel().catch(() => {}); // not awaited: a stuck encoder may never answer
    throw e;
  }
}

/** Records the clip, picks the glow this browser can draw, and encodes it (spec §4–§5). */
export async function exportMp4(req: Mp4Request, signal: AbortSignal, onProgress: (done: number) => void, sink?: SinkFactory): Promise<Blob> {
  const frames = await record(req, signal);
  const glow: Glow = (await blurWorks()) ? 'blur' : 'halo';
  return makeMp4({ frames, look: req.look, size: req.size, background: req.background, glow }, signal, onProgress, sink);
}
