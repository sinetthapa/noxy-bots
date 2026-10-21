// @vitest-environment happy-dom
// SVG and PNG export (M3 spec §5.6): failures toast once, and every Blob URL is revoked.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportImage, png } from './export.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Fake Blob URLs, so the test can see each one made and revoked. */
function urls() {
  const made: string[] = [];
  const revoked: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const u = `blob:${made.length + 1}`;
    made.push(u);
    return u;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => void revoked.push(u));
  return { made, revoked };
}
/** An Image that loads (with the frame's size) or fails as soon as its src is set. */
const fakeImage = (ok: boolean) =>
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 985;
      naturalHeight = 830;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => (ok ? this.onload?.() : this.onerror?.()));
      }
    },
  );
/** A canvas whose 2D context and blob the test chooses. */
function fakeCanvas(ctx: unknown, blob: Blob | null) {
  const make = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob | null) => void) => cb(blob) } : make(tag)) as typeof document.createElement);
}

describe('png', () => {
  it('a failing image rejects and revokes its URL', async () => {
    const { made, revoked } = urls();
    fakeImage(false);
    await expect(png('<svg/>', 256)).rejects.toThrow("the SVG didn't load");
    expect(revoked).toEqual(made);
  });

  it('a missing 2D context rejects and revokes', async () => {
    const { made, revoked } = urls();
    fakeImage(true);
    fakeCanvas(null, null);
    await expect(png('<svg/>', 256)).rejects.toThrow('no 2D canvas');
    expect(revoked).toEqual(made);
  });

  it('a null blob rejects and revokes', async () => {
    const { made, revoked } = urls();
    fakeImage(true);
    fakeCanvas({ drawImage() {} }, null);
    await expect(png('<svg/>', 256)).rejects.toThrow('empty PNG');
    expect(revoked).toEqual(made);
  });

  it('fits the frame inside the square, centred', async () => {
    urls();
    fakeImage(true);
    const drawImage = vi.fn();
    fakeCanvas({ drawImage }, new Blob(['png']));
    await png('<svg/>', 1000);
    const [, x, y, w, h] = drawImage.mock.calls[0];
    expect(x).toBeCloseTo(0);
    expect(w).toBeCloseTo(1000);
    expect(h).toBeCloseTo((830 / 985) * 1000);
    expect(y).toBeCloseTo((1000 - h) / 2);
  });
});

describe('exportImage', () => {
  it('a failure toasts once and downloads nothing', async () => {
    urls();
    fakeImage(false);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const notify = vi.fn();
    await exportImage('<svg/>', 512, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Couldn't export the image");
    expect(click).not.toHaveBeenCalled();
  });

  it('svg downloads noxy.svg and revokes the URL afterwards', async () => {
    vi.useFakeTimers();
    const { made, revoked } = urls();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    await exportImage('<svg/>', 'svg', vi.fn());
    expect(names).toEqual(['noxy.svg']);
    vi.runAllTimers();
    expect(revoked).toEqual(made);
  });
});
