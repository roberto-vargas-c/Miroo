"use client";

import { useState } from "react";
import { ColorWheel } from "./ColorWheel";

const SWATCHES = ["#111827", "#ffffff", "#0f8573", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a"];
export const PEN_WIDTHS = [1, 2, 3, 5, 8, 12, 18, 26];
export const HIGHLIGHT_WIDTHS = [10, 18, 28, 40];

/** Side palette for the pen and highlighter: colors, a color wheel with eyedropper, and stroke widths. */
export function PenPalette({ color, setColor, width, setWidth, highlighter }: {
  color: string; setColor: (c: string) => void; width: number; setWidth: (w: number) => void; highlighter: boolean;
}) {
  const [wheel, setWheel] = useState(false);
  const widths = highlighter ? HIGHLIGHT_WIDTHS : PEN_WIDTHS;
  const custom = !SWATCHES.includes(color.toLowerCase());
  return (
    <div className="absolute left-3 top-[4.25rem] z-10 flex gap-2 sm:left-16 sm:top-1/2 sm:ml-2 sm:-translate-y-1/2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <div className="grid grid-cols-2 gap-1.5">
          {SWATCHES.map((c) => (
            <button key={c} title={c} onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border border-slate-200 ${color.toLowerCase() === c ? "ring-2 ring-brand-500 ring-offset-1" : ""}`} style={{ background: c }} />
          ))}
          <button title="More colors" onClick={() => setWheel((w) => !w)}
            className={`col-span-2 mx-auto h-6 w-6 rounded-full ${custom || wheel ? "ring-2 ring-brand-500 ring-offset-1" : ""}`}
            style={{ background: custom ? color : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
        </div>
        <div className="my-0.5 h-px bg-slate-100" />
        {widths.map((w) => (
          <button key={w} title={`${w} px`} onClick={() => setWidth(w)}
            className={`flex h-7 w-full items-center justify-center rounded-md ${width === w ? "bg-brand-50 ring-1 ring-brand-500" : "hover:bg-slate-100"}`}>
            <span className="block rounded-full" style={{
              width: Math.min(22, Math.max(3, w * (highlighter ? 0.5 : 1))), height: Math.min(22, Math.max(3, w * (highlighter ? 0.5 : 1))),
              background: color === "#ffffff" ? "#cbd5e1" : color, opacity: highlighter ? 0.5 : 1,
            }} />
          </button>
        ))}
      </div>
      {wheel && (
        <div className="card self-center p-3">
          <ColorWheel value={color} onChange={setColor} />
        </div>
      )}
    </div>
  );
}
