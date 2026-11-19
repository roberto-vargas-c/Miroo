"use client";

import { useEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";

// ── Color math ──
function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((h * 60) + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToHex(h: number, s: number, v: number) {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return toHex(f(5) * 255, f(3) * 255, f(1) * 255);
}

const SIZE = 180;

/** HSV color wheel (hue around, saturation outward) with a brightness slider, hex field and eyedropper. */
export function ColorWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const init = rgbToHsv(...(Object.values(hexToRgb(value) ?? { r: 17, g: 24, b: 39 }) as [number, number, number]));
  const [hsv, setHsv] = useState(init);
  const [hex, setHex] = useState(value);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  // Follow outside changes (e.g. picking a swatch) unless they're our own.
  useEffect(() => {
    if (value.toLowerCase() === hsvToHex(hsv.h, hsv.s, hsv.v)) return;
    const rgb = hexToRgb(value);
    if (rgb) { setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b)); setHex(value); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(SIZE, SIZE);
    const R = SIZE / 2;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const dx = x - R, dy = y - R, d = Math.hypot(dx, dy);
      const i = (y * SIZE + x) * 4;
      if (d > R) { img.data[i + 3] = 0; continue; }
      const h = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
      const rgb = hexToRgb(hsvToHex(h, d / R, hsv.v))!;
      img.data[i] = rgb.r; img.data[i + 1] = rgb.g; img.data[i + 2] = rgb.b;
      img.data[i + 3] = d > R - 1 ? Math.round(255 * (R - d)) : 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [hsv.v]);

  const commit = (h: number, s: number, v: number) => {
    setHsv({ h, s, v });
    const out = hsvToHex(h, s, v);
    setHex(out);
    onChange(out);
  };
  const fromPointer = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - r.left - SIZE / 2, dy = e.clientY - r.top - SIZE / 2;
    const s = Math.min(1, Math.hypot(dx, dy) / (SIZE / 2));
    const h = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
    // A dark color makes the whole wheel dark; picking on it brings the brightness back up.
    commit(h, s, hsv.v < 0.25 ? 1 : hsv.v);
  };
  const angle = ((hsv.h - 180) * Math.PI) / 180;
  const knob = { x: SIZE / 2 + Math.cos(angle) * hsv.s * (SIZE / 2), y: SIZE / 2 + Math.sin(angle) * hsv.s * (SIZE / 2) };

  const hasDropper = typeof window !== "undefined" && "EyeDropper" in window;
  // Without the EyeDropper API (Safari, Firefox), the next click samples a color from the board.
  const [sampling, setSampling] = useState(false);
  useEffect(() => {
    if (!sampling) return;
    document.body.style.cursor = "crosshair";
    const onDown = (e: PointerEvent) => {
      const canvases = document.elementsFromPoint(e.clientX, e.clientY).filter((n): n is HTMLCanvasElement => n instanceof HTMLCanvasElement && n !== canvas.current);
      if (!canvases.length) { setSampling(false); return; }
      e.preventDefault(); e.stopPropagation();
      let rgb: { r: number; g: number; b: number } | null = null;
      for (const c of canvases) {
        const r = c.getBoundingClientRect();
        const px = Math.floor(((e.clientX - r.left) * c.width) / r.width), py = Math.floor(((e.clientY - r.top) * c.height) / r.height);
        try {
          const d = c.getContext("2d")?.getImageData(px, py, 1, 1).data;
          if (d && d[3] > 0) { rgb = { r: d[0], g: d[1], b: d[2] }; break; }
        } catch { /* tainted */ }
      }
      if (!rgb) rgb = hexToRgb(getComputedStyle(canvases[0].parentElement!).backgroundColor.match(/\d+/g)?.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("") ?? "") ?? { r: 248, g: 250, b: 252 };
      const c = rgbToHsv(rgb.r, rgb.g, rgb.b);
      commit(c.h, c.s, c.v);
      setSampling(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSampling(false); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.cursor = ""; window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampling]);
  const dropper = async () => {
    if (!hasDropper) { setSampling((x) => !x); return; }
    try {
      const ED = (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
      const { sRGBHex } = await new ED().open();
      const rgb = hexToRgb(sRGBHex) ?? (() => { const m = sRGBHex.match(/\d+/g); return m ? { r: +m[0], g: +m[1], b: +m[2] } : null; })();
      if (rgb) { const c = rgbToHsv(rgb.r, rgb.g, rgb.b); commit(c.h, c.s, c.v); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="flex w-[200px] flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="relative mx-auto touch-none" style={{ width: SIZE, height: SIZE }}
        onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => { if (dragging.current) fromPointer(e); }}
        onPointerUp={() => { dragging.current = false; }}>
        <canvas ref={canvas} width={SIZE} height={SIZE} className="rounded-full" />
        <div className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
          style={{ left: knob.x, top: knob.y, background: hsvToHex(hsv.h, hsv.s, hsv.v) }} />
      </div>
      <input type="range" min={0} max={100} value={Math.round(hsv.v * 100)} aria-label="Brightness"
        onChange={(e) => commit(hsv.h, hsv.s, Number(e.target.value) / 100)}
        className="w-full" style={{ accentColor: hsvToHex(hsv.h, hsv.s, Math.max(hsv.v, 0.3)) }} />
      <div className="flex items-center gap-1.5">
        <span className="h-7 w-7 shrink-0 rounded-md border border-slate-200" style={{ background: hsvToHex(hsv.h, hsv.s, hsv.v) }} />
        <input className="input h-7 min-w-0 flex-1 px-2 py-0 font-mono text-xs" value={hex} aria-label="Hex color"
          onChange={(e) => {
            setHex(e.target.value);
            const rgb = hexToRgb(e.target.value);
            if (rgb) { const c = rgbToHsv(rgb.r, rgb.g, rgb.b); setHsv(c); onChange(toHex(rgb.r, rgb.g, rgb.b)); }
          }} />
        <button className={`btn-ghost h-7 w-7 shrink-0 p-0 ${sampling ? "bg-brand-50 text-brand-700" : ""}`}
          title={hasDropper ? "Pick a color from the screen" : "Pick a color from the board"} onClick={dropper}><Pipette size={15} /></button>
      </div>
    </div>
  );
}
