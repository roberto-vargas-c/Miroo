"use client";

import { ArrowUpToLine, ArrowDownToLine, Copy, Trash2, Lock, Unlock, ArrowLeftRight } from "lucide-react";
import { STICKY_COLORS, SHAPE_COLORS, type BoardElement, type ConnectorElement } from "@/lib/board/types";
import type { BoardApi } from "./useBoard";

export function PropertiesBar({
  selected, all, api, onDuplicate, onDelete,
}: {
  selected: BoardElement[]; all: BoardElement[]; api: BoardApi; onDuplicate: () => void; onDelete: () => void;
}) {
  if (!selected.length) return null;
  const types = new Set(selected.map((s) => s.type));
  const only = (t: BoardElement["type"]) => types.size === 1 && types.has(t);
  const setAll = (patch: Partial<BoardElement>) => api.updateMany(selected.map((s) => ({ id: s.id, patch })));
  const zs = all.map((e) => e.z);
  const front = () => { let z = Math.max(...zs); api.updateMany(selected.map((s) => ({ id: s.id, patch: { z: ++z } }))); };
  const back = () => { let z = Math.min(...zs); api.updateMany(selected.map((s) => ({ id: s.id, patch: { z: --z } }))); };
  const locked = selected.every((s) => s.locked);
  const hasText = selected.some((s) => ["sticky", "rect", "ellipse", "diamond", "text"].includes(s.type));

  const fillColors = only("sticky") ? STICKY_COLORS : SHAPE_COLORS;
  const showFill = selected.some((s) => ["sticky", "rect", "ellipse", "diamond", "frame"].includes(s.type));
  const showStroke = selected.some((s) => ["rect", "ellipse", "diamond", "text", "pen", "connector"].includes(s.type));
  const sw = (c: string, active: boolean, onClick: () => void) => (
    <button key={c} onClick={onClick} className={`h-6 w-6 rounded-full border ${active ? "ring-2 ring-brand-500 ring-offset-1" : "border-slate-300"}`} style={{ background: c }} title={c} />
  );
  const first = selected[0];

  return (
    <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      {showFill && (
        <div className="flex items-center gap-1" title="Fill">
          {fillColors.map((c) => sw(c, first.fill === c, () => setAll({ fill: c })))}
        </div>
      )}
      {showStroke && (
        <>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-1" title="Line / text color">
            {["#111827", "#0f8573", "#2563eb", "#db2777", "#ea580c"].map((c) => sw(c, first.stroke === c, () => setAll({ stroke: c })))}
          </div>
        </>
      )}
      {hasText && (
        <>
          <div className="h-6 w-px bg-slate-200" />
          <select className="rounded-md border border-slate-200 px-1 py-0.5 text-sm" value={first.fontSize ?? 16}
            onChange={(e) => setAll({ fontSize: Number(e.target.value) })} title="Font size">
            {[12, 14, 16, 18, 24, 32, 48, 64].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </>
      )}
      {only("connector") && (
        <button className="rounded-md p-1.5 hover:bg-slate-100" title="Arrow direction"
          onClick={() => {
            const c = first as ConnectorElement;
            const next = c.arrowEnd && !c.arrowStart ? { arrowStart: true, arrowEnd: true } : c.arrowStart && c.arrowEnd ? { arrowStart: false, arrowEnd: false } : { arrowStart: false, arrowEnd: true };
            setAll(next as Partial<BoardElement>);
          }}>
          <ArrowLeftRight size={16} />
        </button>
      )}
      <div className="h-6 w-px bg-slate-200" />
      <button className="rounded-md p-1.5 hover:bg-slate-100" title="Bring to front" onClick={front}><ArrowUpToLine size={16} /></button>
      <button className="rounded-md p-1.5 hover:bg-slate-100" title="Send to back" onClick={back}><ArrowDownToLine size={16} /></button>
      <button className="rounded-md p-1.5 hover:bg-slate-100" title={locked ? "Unlock" : "Lock"} onClick={() => setAll({ locked: !locked })}>
        {locked ? <Unlock size={16} /> : <Lock size={16} />}
      </button>
      <button className="rounded-md p-1.5 hover:bg-slate-100" title="Duplicate (Ctrl+D)" onClick={onDuplicate}><Copy size={16} /></button>
      <button className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50" title="Delete" onClick={onDelete}><Trash2 size={16} /></button>
    </div>
  );
}
