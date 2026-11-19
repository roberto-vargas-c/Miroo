"use client";

import { useState } from "react";
import { ArrowUpToLine, ArrowDownToLine, Copy, Trash2, Lock, Unlock, ArrowLeftRight, Scale, FlipHorizontal2, FlipVertical2, Crop } from "lucide-react";
import { STICKY_COLORS, SHAPE_COLORS, type BoardElement, type ConnectorElement, type ConnectorStyle, type CardElement, type ImageElement, type TableElement } from "@/lib/board/types";
import { ColorWheel } from "./ColorWheel";
import { CARD_STATUS } from "./ElementNode";
import type { BoardApi } from "./useBoard";

export function PropertiesBar({
  selected, all, api, onDuplicate, onDelete, onSetScale, onCrop, members = [],
}: {
  selected: BoardElement[]; all: BoardElement[]; api: BoardApi; onDuplicate: () => void; onDelete: () => void; onSetScale?: () => void;
  onCrop?: (el: ImageElement) => void;
  members?: { id: string; name: string; color: string }[];
}) {
  const [wheelFor, setWheelFor] = useState<"fill" | "stroke" | null>(null);
  if (!selected.length) return null;
  const types = new Set(selected.map((s) => s.type));
  const only = (t: BoardElement["type"]) => types.size === 1 && types.has(t);
  const setAll = (patch: Partial<BoardElement>) => api.updateMany(selected.map((s) => ({ id: s.id, patch })));
  const zs = all.map((e) => e.z);
  const front = () => { let z = Math.max(...zs); api.updateMany(selected.map((s) => ({ id: s.id, patch: { z: ++z } }))); };
  const back = () => { let z = Math.min(...zs); api.updateMany(selected.map((s) => ({ id: s.id, patch: { z: --z } }))); };
  const locked = selected.every((s) => s.locked);
  const hasText = selected.some((s) => ["sticky", "rect", "ellipse", "diamond", "text", "card", "table", "topic", "shape"].includes(s.type));

  const fillColors = only("sticky") ? STICKY_COLORS : SHAPE_COLORS;
  const showFill = selected.some((s) => ["sticky", "rect", "ellipse", "diamond", "frame", "wall", "shape", "topic"].includes(s.type));
  const showStroke = selected.some((s) => ["rect", "ellipse", "diamond", "text", "pen", "connector", "dimension", "area", "cloud", "symbol", "shape", "topic"].includes(s.type));
  const sw = (c: string, active: boolean, onClick: () => void) => (
    <button key={c} onClick={onClick} className={`h-6 w-6 rounded-full border ${active ? "ring-2 ring-brand-500 ring-offset-1" : "border-slate-300"}`} style={{ background: c }} title={c} />
  );
  const first = selected[0];
  const custom = (key: "fill" | "stroke", list: string[]) => {
    const v = first[key];
    const isCustom = v.startsWith("#") && !list.includes(v);
    return (
      <div className="relative">
        <button title="More colors" onClick={() => setWheelFor((w) => (w === key ? null : key))}
          className={`h-6 w-6 rounded-full border ${isCustom || wheelFor === key ? "ring-2 ring-brand-500 ring-offset-1" : "border-slate-300"}`}
          style={{ background: isCustom ? v : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
        {wheelFor === key && (
          <div className="card absolute left-1/2 top-9 z-20 -translate-x-1/2 p-3">
            <ColorWheel value={v.startsWith("#") ? v : "#111827"} onChange={(c) => setAll({ [key]: c })} />
          </div>
        )}
      </div>
    );
  };
  const STROKES = ["#111827", "#dc2626", "#0f8573", "#2563eb", "#db2777", "#ea580c"];
  const images = selected.filter((s): s is ImageElement => s.type === "image");

  return (
    <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      {showFill && (
        <div className="flex items-center gap-1" title="Fill">
          {fillColors.map((c) => sw(c, first.fill === c, () => setAll({ fill: c })))}
          {custom("fill", fillColors)}
        </div>
      )}
      {showStroke && (
        <>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-1" title="Line / text color">
            {STROKES.map((c) => sw(c, first.stroke === c, () => setAll({ stroke: c })))}
            {custom("stroke", STROKES)}
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
      {only("card") && selected.length === 1 && (() => {
        const c = first as CardElement;
        return (
          <>
            <div className="h-6 w-px bg-slate-200" />
            <select className="rounded-md border border-slate-200 px-1 py-0.5 text-sm" value={c.status} title="Status"
              onChange={(e) => api.update(c.id, { status: e.target.value } as Partial<BoardElement>)}>
              {Object.entries(CARD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="max-w-[9rem] rounded-md border border-slate-200 px-1 py-0.5 text-sm" value={c.assignee?.id ?? ""} title="Assignee"
              onChange={(e) => {
                const m = members.find((x) => x.id === e.target.value);
                api.update(c.id, { assignee: m ? { id: m.id, name: m.name, color: m.color } : null } as Partial<BoardElement>);
              }}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="date" className="rounded-md border border-slate-200 px-1 py-0.5 text-sm" value={c.due ?? ""} title="Due date"
              onChange={(e) => api.update(c.id, { due: e.target.value || null } as Partial<BoardElement>)} />
          </>
        );
      })()}
      {only("table") && selected.length === 1 && (() => {
        const t = first as TableElement;
        const rows = t.cells.length, cols = t.cells[0]?.length ?? 1;
        const set = (cells: string[][], extra: Partial<TableElement> = {}) => api.update(t.id, { cells, ...extra } as Partial<BoardElement>);
        const b = "rounded-md px-1.5 py-1 text-xs hover:bg-slate-100 disabled:opacity-40";
        return (
          <>
            <div className="h-6 w-px bg-slate-200" />
            <button className={b} onClick={() => set([...t.cells, Array(cols).fill("")], { height: t.height + t.height / rows })}>+ Row</button>
            <button className={b} disabled={rows <= 1} onClick={() => set(t.cells.slice(0, -1), { height: t.height - t.height / rows })}>− Row</button>
            <button className={b} onClick={() => set(t.cells.map((r) => [...r, ""]), { width: t.width + t.width / cols })}>+ Col</button>
            <button className={b} disabled={cols <= 1} onClick={() => set(t.cells.map((r) => r.slice(0, -1)), { width: t.width - t.width / cols })}>− Col</button>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={t.header}
              onChange={(e) => api.update(t.id, { header: e.target.checked } as Partial<BoardElement>)} /> Header</label>
          </>
        );
      })()}
      {only("connector") && (
        <div className="flex items-center gap-0.5">
          {([["straight", "Straight", "M4 18 L18 4"], ["curved", "Curved", "M4 18 C12 18 10 4 18 4"], ["elbow", "Angled", "M4 18 L11 18 L11 4 L18 4"]] as [ConnectorStyle, string, string][]).map(([id, label, d]) => (
            <button key={id} title={`${label} connector`} onClick={() => setAll({ style: id } as Partial<BoardElement>)}
              className={`rounded-md p-1 ${((first as ConnectorElement).style ?? "straight") === id ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "hover:bg-slate-100"}`}>
              <svg width="18" height="18" viewBox="0 0 22 22"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      )}
      {images.length > 0 && images.length === selected.length && (
        <div className="flex items-center gap-0.5">
          <button className="rounded-md p-1.5 hover:bg-slate-100" title="Mirror horizontally"
            onClick={() => api.updateMany(images.map((i) => ({ id: i.id, patch: { flipX: !i.flipX } as Partial<BoardElement> })))}><FlipHorizontal2 size={16} /></button>
          <button className="rounded-md p-1.5 hover:bg-slate-100" title="Mirror vertically"
            onClick={() => api.updateMany(images.map((i) => ({ id: i.id, patch: { flipY: !i.flipY } as Partial<BoardElement> })))}><FlipVertical2 size={16} /></button>
          {images.length === 1 && onCrop && (
            <button className="rounded-md p-1.5 hover:bg-slate-100" title="Crop" onClick={() => onCrop(images[0])}><Crop size={16} /></button>
          )}
        </div>
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
      {!only("connector") && (
        <label className="flex items-center gap-1.5 text-xs text-slate-500" title="Transparency">
          <span className="h-4 w-4 rounded-sm border border-slate-300" style={{ background: "repeating-conic-gradient(#cbd5e1 0 25%, #fff 0 50%) 50% / 8px 8px" }} />
          <input type="range" min={5} max={100} step={5} className="w-20"
            value={Math.round((first.opacity ?? 1) * 100)}
            onChange={(e) => setAll({ opacity: Number(e.target.value) / 100 })} />
          <span className="w-8 tabular-nums">{Math.round((first.opacity ?? 1) * 100)}%</span>
        </label>
      )}
      {onSetScale && (
        <button className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-slate-100" title="Set this plan's real-world scale" onClick={onSetScale}>
          <Scale size={16} /> Scale
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
