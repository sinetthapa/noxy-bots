// SVG and PNG export (M3 spec §5.6): from bot.snapshot(), square transparent PNGs; every Blob URL is revoked.
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // some browsers cancel a download whose URL goes away at once
}

/** Loads an image; rejects if it doesn't load. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the SVG didn't load"));
    img.src = url;
  });
}

/** The SVG fitted inside a size × size transparent square, centred. */
export async function png(svg: string, size: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D canvas');
    const k = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty PNG'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One export button: downloads, or tells the user once that it failed. */
export async function exportImage(svg: string, size: number | 'svg', notify: (msg: string) => void): Promise<void> {
  try {
    if (size === 'svg') download(new Blob([svg], { type: 'image/svg+xml' }), 'noxy.svg');
    else download(await png(svg, size), `noxy-${size}.png`);
  } catch {
    notify("Couldn't export the image");
  }
}
