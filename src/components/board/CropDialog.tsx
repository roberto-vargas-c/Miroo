"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageElement } from "@/lib/board/types";

type Box = { x: number; y: number; width: number; height: number };
type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const FULL: Box = { x: 0, y: 0, width: 1, height: 1 };
const MIN = 0.03;

/** Lets you drag a crop box over the whole picture. The box is kept as fractions of the picture. */
export function CropDialog({ el, onApply, onClose }: { el: ImageElement; onApply: (crop: Box | undefined) => void; onClose: () => void }) {
  const [box, setBox] = useState<Box>(el.crop ?? FULL);
  const [ratio, setRatio] = useState<number | null>(null); // width / height in picture pixels
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ h: Handle; px: number; py: number; start: Box } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clamp = (b: Box): Box => {
    const width = Math.min(1, Math.max(MIN, b.width)), height = Math.min(1, Math.max(MIN, b.height));
    return { width, height, x: Math.min(1 - width, Math.max(0, b.x)), y: Math.min(1 - height, Math.max(0, b.y)) };
  };
  const withRatio = (b: Box, r: number | null, anchorTop = true): Box => {
    if (!r || !nat) return b;
    const h = (b.width * nat.w) / r / nat.h;
    return { ...b, height: h, y: anchorTop ? b.y : b.y + b.height - h };
  };

  const onDown = (h: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { h, px: e.clientX, py: e.clientY, start: box };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, r = area.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = (e.clientX - d.px) / r.width, dy = (e.clientY - d.py) / r.height;
    const s = d.start;
    let b = { ...s };
    if (d.h === "move") b = { ...s, x: s.x + dx, y: s.y + dy };
    else {
      if (d.h.includes("w")) { b.x = Math.min(s.x + s.width - MIN, Math.max(0, s.x + dx)); b.width = s.x + s.width - b.x; }
      if (d.h.includes("e")) b.width = Math.min(1 - s.x, s.width + dx);
      if (d.h.includes("n")) { b.y = Math.min(s.y + s.height - MIN, Math.max(0, s.y + dy)); b.height = s.y + s.height - b.y; }
      if (d.h.includes("s")) b.height = Math.min(1 - s.y, s.height + dy);
      if (ratio && nat) b = withRatio(b, ratio, !d.h.includes("n"));
    }
    setBox(clamp(b));
  };
  const setAspect = (r: number | null) => {
    setRatio(r);
    if (r && nat) setBox((b) => clamp(withRatio(b, r)));
  };

  const pct = (v: number) => `${v * 100}%`;
  const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const pos: Record<Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5], move: [0.5, 0.5] };
  const cursor: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", move: "move" };
  const full = box.x === 0 && box.y === 0 && box.width === 1 && box.height === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onPointerDown={onClose}>
      <div className="card flex max-w-[92vw] flex-col gap-3 p-4" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">Crop image</h2>
          {([["Free", null], ["1:1", 1], ["4:3", 4 / 3], ["16:9", 16 / 9], ["3:4", 3 / 4]] as const).map(([label, r]) => (
            <button key={label} onClick={() => setAspect(r)}
              className={`rounded-md px-2 py-1 text-sm ${ratio === r ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "hover:bg-slate-100"}`}>{label}</button>
          ))}
        </div>
        <div ref={area} className="relative mx-auto touch-none select-none" onPointerMove={onMove} onPointerUp={() => { drag.current = null; }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={el.src} alt="" draggable={false} className="block max-h-[66vh] max-w-[84vw]"
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          <div className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]" onPointerDown={onDown("move")}
            style={{ left: pct(box.x), top: pct(box.y), width: pct(box.width), height: pct(box.height), cursor: "move" }}>
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }, (_, i) => <div key={i} className="border border-white/30" />)}
            </div>
            {handles.map((h) => (
              <div key={h} onPointerDown={onDown(h)} className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-slate-500 bg-white"
                style={{ left: pct(pos[h][0]), top: pct(pos[h][1]), cursor: cursor[h] }} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => { setBox(FULL); setRatio(null); }} disabled={full}>Reset</button>
          <div className="ml-auto flex gap-2">
            <button className="btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onApply(full ? undefined : box)}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** New size and position for an image after its crop changes, so the picture stays put and keeps its scale. */
export function applyCrop(el: ImageElement, next: Box | undefined): Partial<ImageElement> {
  const old = el.crop ?? FULL, nb = next ?? FULL;
  const kx = el.width / old.width, ky = el.height / old.height; // element units per whole picture
  const dx = el.flipX ? (old.x + old.width - (nb.x + nb.width)) * kx : (nb.x - old.x) * kx;
  const dy = el.flipY ? (old.y + old.height - (nb.y + nb.height)) * ky : (nb.y - old.y) * ky;
  const a = (el.rotation * Math.PI) / 180;
  return {
    crop: next,
    width: nb.width * kx, height: nb.height * ky,
    x: el.x + dx * Math.cos(a) - dy * Math.sin(a), y: el.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
