// Decodes an animated GIF into fully composited frames so the canvas can play it
// (a plain <img> drawn on a canvas only ever shows the first frame).
export type GifFrames = { frames: HTMLCanvasElement[]; delays: number[]; width: number; height: number };

const cache = new Map<string, Promise<GifFrames | null>>();
const MAX_PIXELS = 60_000_000; // frames × width × height, to keep memory bounded

export function loadGif(url: string): Promise<GifFrames | null> {
  let p = cache.get(url);
  if (!p) {
    p = decode(url).catch(() => null);
    cache.set(url, p);
  }
  return p;
}

async function decode(url: string): Promise<GifFrames | null> {
  const { parseGIF, decompressFrames } = await import("gifuct-js");
  const buf = await (await fetch(url)).arrayBuffer();
  const gif = parseGIF(buf);
  const parts = decompressFrames(gif, true);
  if (parts.length < 2) return null;
  const { width, height } = gif.lsd;
  const count = Math.min(parts.length, Math.max(2, Math.floor(MAX_PIXELS / (width * height))));

  const work = document.createElement("canvas");
  work.width = width; work.height = height;
  const ctx = work.getContext("2d")!;
  const patch = document.createElement("canvas");
  const pctx = patch.getContext("2d")!;
  const frames: HTMLCanvasElement[] = [], delays: number[] = [];
  for (let i = 0; i < count; i++) {
    const f = parts[i];
    const before = f.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
    patch.width = f.dims.width; patch.height = f.dims.height;
    pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height), 0, 0);
    ctx.drawImage(patch, f.dims.left, f.dims.top);
    const out = document.createElement("canvas");
    out.width = width; out.height = height;
    out.getContext("2d")!.drawImage(work, 0, 0);
    frames.push(out);
    delays.push(f.delay && f.delay >= 20 ? f.delay : 100);
    if (f.disposalType === 2) ctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
    else if (before) ctx.putImageData(before, 0, 0);
  }
  return { frames, delays, width, height };
}
