"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpToLine, ArrowDownToLine, Copy, Trash2, Lock, Unlock, ArrowLeftRight, Scale, FlipHorizontal2, FlipVertical2, Crop, AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, ChevronDown, Image as ImageIcon, LayoutGrid, LayoutPanelLeft, Grid3x3, Palette,
  Sparkles, Group as GroupIcon, Ungroup, Table2, Filter } from "lucide-react";
import { FONTS, fontFamily, STICKY_COLORS, SHAPE_COLORS, type BoardElement, type ConnectorElement, type ConnectorStyle, type CardElement, type ImageElement, type TableElement } from "@/lib/board/types";
import { ColorWheel } from "./ColorWheel";
import { QUALITIES, type Quality } from "./imageQuality";
import { CARD_STATUS } from "./ElementNode";
import type { BoardApi } from "./useBoard";
import { clusterByColor, tidyGrid } from "./arrange";

export function PropertiesBar({
  selected, all, api, onDuplicate, onDelete, onSetScale, onCrop, onQuality, onAiCluster, onSelect, members = [],
}: {
  selected: BoardElement[]; all: BoardElement[]; api: BoardApi; onDuplicate: () => void; onDelete: () => void; onSetScale?: () => void;
  onCrop?: (el: ImageElement) => void;
  onQuality?: (q: Quality) => void;
  /** Groups the selection's text by theme with AI; missing when AI isn't set up. */
  onAiCluster?: () => void;
  /** Replaces the selection (used by the type filter). */
  onSelect?: (ids: string[]) => void;
  members?: { id: string; name: string; color: string }[];
}) {
  const [wheelFor, setWheelFor] = useState<"fill" | "stroke" | null>(null);
  const [open, setOpenRaw] = useState<string | null>(null);
  const setOpen = (v: string | null) => { setOpenRaw(v); setWheelFor(null); };
  const barRef = useRef<HTMLDivElement>(null);
  // A tap outside the bar closes its open panel.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!barRef.current?.contains(e.target as Node)) { setOpenRaw(null); setWheelFor(null); } };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
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
      <button title="More colors" onClick={() => setWheelFor((w) => (w === key ? null : key))}
        className={`h-6 w-6 rounded-full border ${isCustom || wheelFor === key ? "ring-2 ring-brand-500 ring-offset-1" : "border-slate-300"}`}
        style={{ background: isCustom ? v : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
    );
  };
  const STROKES = ["#111827", "#dc2626", "#0f8573", "#2563eb", "#db2777", "#ea580c"];
  const images = selected.filter((s): s is ImageElement => s.type === "image");
  // Align / distribute: works on the selection's bounding box; connectors follow their ends.
  const movable = selected.filter((e) => e.type !== "connector" && !e.locked);
  const align = (mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => {
    const x1 = Math.min(...movable.map((e) => e.x)), x2 = Math.max(...movable.map((e) => e.x + e.width));
    const y1 = Math.min(...movable.map((e) => e.y)), y2 = Math.max(...movable.map((e) => e.y + e.height));
    api.updateMany(movable.map((e) => ({
      id: e.id,
      patch: mode === "left" ? { x: x1 } : mode === "right" ? { x: x2 - e.width } : mode === "hcenter" ? { x: (x1 + x2) / 2 - e.width / 2 }
        : mode === "top" ? { y: y1 } : mode === "bottom" ? { y: y2 - e.height } : { y: (y1 + y2) / 2 - e.height / 2 },
    })));
  };
  const distribute = (axis: "x" | "y") => {
    const size = axis === "x" ? "width" : "height";
    const sorted = [...movable].sort((a, b) => a[axis] + a[size] / 2 - (b[axis] + b[size] / 2));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const span = last[axis] + last[size] - first[axis];
    const gap = (span - sorted.reduce((t, e) => t + e[size], 0)) / (sorted.length - 1);
    let pos = first[axis];
    api.updateMany(sorted.map((e) => { const patch = { [axis]: pos }; pos += e[size] + gap; return { id: e.id, patch }; }));
  };

  const isGroup = selected.length > 1 && !!first.groupId && selected.every((e) => e.groupId === first.groupId);
  const hasGroups = selected.some((e) => e.groupId);
  const group = () => { const g = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; setAll({ groupId: g }); };
  const ungroup = () => setAll({ groupId: undefined });
  const sep = <div className="h-6 w-px bg-slate-200" />;
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 disabled:opacity-40";
  const label = (t: string) => <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{t}</div>;
  const textual = movable.filter((e) => e.text);

  return (
    <div ref={barRef} className="absolute left-3 right-3 top-[4.25rem] z-10 flex flex-wrap items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 shadow-lg sm:left-1/2 sm:right-auto sm:top-16 sm:flex-nowrap sm:-translate-x-1/2">
      {onSelect && types.size > 1 && (
        <>
          <Drop id="filter" open={open} setOpen={setOpen} title="Filter the selection by type"
            trigger={<span className="flex items-center gap-1 text-sm"><Filter size={15} /><span className="tabular-nums">{selected.length}</span></span>}>
            <div className="w-56 p-1">
              {label("Keep only")}
              {[...types].map((t) => ({ t, n: selected.filter((e) => e.type === t).length })).sort((a, b) => b.n - a.n).map(({ t, n }) => (
                <button key={t} className={item} onClick={() => { setOpen(null); onSelect(selected.filter((e) => e.type === t).map((e) => e.id)); }}>
                  <span className="flex-1">{TYPE_NAMES[t] ?? t}</span><span className="tabular-nums text-slate-400">{n}</span>
                </button>
              ))}
            </div>
          </Drop>
          {sep}
        </>
      )}
      {(showFill || showStroke || !only("connector")) && (
        <Drop id="color" open={open} setOpen={setOpen} title="Color and transparency"
          trigger={<span className="relative block h-5 w-5 rounded-full border border-slate-300" style={{ background: showFill ? first.fill : "transparent", boxShadow: showStroke ? `inset 0 0 0 3px ${first.stroke}` : undefined }} />}>
          <div className="w-64 space-y-1 p-1">
            {showFill && (<>{label("Fill")}<div className="flex flex-wrap items-center gap-1.5 px-2">{fillColors.map((c) => sw(c, first.fill === c, () => setAll({ fill: c })))}{custom("fill", fillColors)}</div></>)}
            {showStroke && (<>{label(only("text") ? "Text color" : "Line color")}<div className="flex flex-wrap items-center gap-1.5 px-2">{STROKES.map((c) => sw(c, first.stroke === c, () => setAll({ stroke: c })))}{custom("stroke", STROKES)}</div></>)}
            {wheelFor && <div className="px-2 pt-2"><ColorWheel value={first[wheelFor].startsWith("#") ? first[wheelFor] : "#111827"} onChange={(c) => setAll({ [wheelFor]: c })} /></div>}
            {!only("connector") && (<>{label("Transparency")}
              <label className="flex items-center gap-2 px-2 pb-1 text-xs text-slate-500">
                <input type="range" min={5} max={100} step={5} className="flex-1" value={Math.round((first.opacity ?? 1) * 100)}
                  onChange={(e) => setAll({ opacity: Number(e.target.value) / 100 })} />
                <span className="w-9 text-right tabular-nums">{Math.round((first.opacity ?? 1) * 100)}%</span>
              </label></>)}
          </div>
        </Drop>
      )}
      {hasText && (
        <Drop id="text" open={open} setOpen={setOpen} title="Text: font, size and alignment"
          trigger={<span className="flex items-center gap-1 text-sm"><span style={{ fontFamily: fontFamily(first.font) }} className="font-semibold">Aa</span><span className="tabular-nums text-slate-500">{first.fontSize ?? 16}</span></span>}>
          <div className="w-56 space-y-2 p-2">
            <select className="input py-1 text-sm" value={first.font ?? "sans"} title="Font" onChange={(e) => setAll({ font: e.target.value })}>
              {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>{f.name}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <select className="input w-20 py-1 text-sm" value={first.fontSize ?? 16} onChange={(e) => setAll({ fontSize: Number(e.target.value) })} title="Font size">
                {[12, 14, 16, 18, 24, 32, 48, 64].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <div className="flex items-center gap-0.5">
                {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
                  <button key={a} title={`Align text ${a}`} onClick={() => setAll({ align: a })}
                    className={`rounded-md p-1.5 ${(first.align ?? (first.type === "text" ? "left" : "center")) === a ? "bg-brand-50 text-brand-700" : "hover:bg-slate-100"}`}>
                    <Icon size={15} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Drop>
      )}
      {only("connector") && (
        <Drop id="line" open={open} setOpen={setOpen} title="Line style"
          trigger={<svg width="22" height="18" viewBox="0 0 22 22"><path d={CONNECTOR_PATHS[(first as ConnectorElement).style ?? "straight"]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}>
          <div className="w-56 p-1">
            {label("Shape")}
            <div className="flex gap-1 px-2">
              {([["straight", "Straight"], ["curved", "Curved"], ["elbow", "Angled"]] as [ConnectorStyle, string][]).map(([id, l]) => (
                <button key={id} title={`${l} connector`} onClick={() => setAll({ style: id } as Partial<BoardElement>)}
                  className={`rounded-md p-1 ${((first as ConnectorElement).style ?? "straight") === id ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "hover:bg-slate-100"}`}>
                  <svg width="20" height="20" viewBox="0 0 22 22"><path d={CONNECTOR_PATHS[id]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
            {label("Pattern")}
            <div className="flex gap-1 px-2">
              {([["solid", "Solid line", undefined], ["dashed", "Dashed line", "5 4"], ["dotted", "Dotted line", "0.1 4"]] as const).map(([id, l, dash]) => (
                <button key={id} title={l} onClick={() => setAll({ pattern: id } as Partial<BoardElement>)}
                  className={`rounded-md p-1 ${((first as ConnectorElement).pattern ?? "solid") === id ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "hover:bg-slate-100"}`}>
                  <svg width="22" height="18" viewBox="0 0 22 18"><path d="M3 9 H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={dash} /></svg>
                </button>
              ))}
            </div>
            <div className="mt-1 border-t border-slate-100 pt-1">
              <button className={item} title="Arrow direction" onClick={() => {
                const c = first as ConnectorElement;
                const next = c.arrowEnd && !c.arrowStart ? { arrowStart: true, arrowEnd: true } : c.arrowStart && c.arrowEnd ? { arrowStart: false, arrowEnd: false } : { arrowStart: false, arrowEnd: true };
                setAll(next as Partial<BoardElement>);
              }}><ArrowLeftRight size={15} /> Change arrowheads</button>
            </div>
          </div>
        </Drop>
      )}
      {images.length > 0 && images.length === selected.length && (
        <Drop id="image" open={open} setOpen={setOpen} title="Image: mirror, crop and quality" trigger={<ImageIcon size={16} />}>
          <div className="w-56 p-1">
            <button className={item} title="Mirror horizontally" onClick={() => api.updateMany(images.map((i) => ({ id: i.id, patch: { flipX: !i.flipX } as Partial<BoardElement> })))}><FlipHorizontal2 size={15} /> Mirror horizontally</button>
            <button className={item} title="Mirror vertically" onClick={() => api.updateMany(images.map((i) => ({ id: i.id, patch: { flipY: !i.flipY } as Partial<BoardElement> })))}><FlipVertical2 size={15} /> Mirror vertically</button>
            {images.length === 1 && onCrop && <button className={item} title="Crop" onClick={() => { setOpen(null); onCrop(images[0]); }}><Crop size={15} /> Crop…</button>}
            {onQuality && (<>{label("Quality (makes pictures lighter)")}
              <select className="input mx-2 w-[calc(100%-1rem)] py-1 text-sm" title="Image quality: makes the selected pictures smaller; new uploads use it too"
                value="" onChange={(e) => { if (e.target.value) { onQuality(e.target.value as Quality); setOpen(null); } }}>
                <option value="">Choose…</option>
                {QUALITIES.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
              </select></>)}
          </div>
        </Drop>
      )}
      {only("card") && selected.length === 1 && (() => {
        const c = first as CardElement;
        return (
          <Drop id="card" open={open} setOpen={setOpen} title="Task: status, assignee and due date"
            trigger={<span className="text-sm">{CARD_STATUS[c.status]?.label ?? "Task"}</span>}>
            <div className="w-60 space-y-2 p-2">
              <select className="input py-1 text-sm" value={c.status} title="Status" onChange={(e) => api.update(c.id, { status: e.target.value } as Partial<BoardElement>)}>
                {Object.entries(CARD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="input py-1 text-sm" value={c.assignee?.id ?? ""} title="Assignee"
                onChange={(e) => {
                  const m = members.find((x) => x.id === e.target.value);
                  api.update(c.id, { assignee: m ? { id: m.id, name: m.name, color: m.color } : null } as Partial<BoardElement>);
                }}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input type="date" className="input py-1 text-sm" value={c.due ?? ""} title="Due date" onChange={(e) => api.update(c.id, { due: e.target.value || null } as Partial<BoardElement>)} />
            </div>
          </Drop>
        );
      })()}
      {only("table") && selected.length === 1 && (() => {
        const t = first as TableElement;
        const rows = t.cells.length, cols = t.cells[0]?.length ?? 1;
        const set = (cells: string[][], extra: Partial<TableElement> = {}) => api.update(t.id, { cells, ...extra } as Partial<BoardElement>);
        return (
          <Drop id="table" open={open} setOpen={setOpen} title="Rows and columns" trigger={<Table2 size={16} />}>
            <div className="w-52 p-1">
              <button className={item} onClick={() => set([...t.cells, Array(cols).fill("")], { height: t.height + t.height / rows })}>Add a row</button>
              <button className={item} disabled={rows <= 1} onClick={() => set(t.cells.slice(0, -1), { height: t.height - t.height / rows })}>Remove the last row</button>
              <button className={item} onClick={() => set(t.cells.map((r) => [...r, ""]), { width: t.width + t.width / cols })}>Add a column</button>
              <button className={item} disabled={cols <= 1} onClick={() => set(t.cells.map((r) => r.slice(0, -1)), { width: t.width - t.width / cols })}>Remove the last column</button>
              <label className={item}><input type="checkbox" checked={t.header} onChange={(e) => api.update(t.id, { header: e.target.checked } as Partial<BoardElement>)} /> Header row</label>
            </div>
          </Drop>
        );
      })()}
      {onSetScale && (
        <button className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-slate-100" title="Set this plan's real-world scale" onClick={onSetScale}>
          <Scale size={16} /> Scale
        </button>
      )}
      {sep}
      <Drop id="arrange" open={open} setOpen={setOpen} title="Arrange: align, distribute and layer order" trigger={<LayoutPanelLeft size={16} />}>
        <div className="w-56 p-1">
          {movable.length >= 2 && (<>
            {label("Align")}
            <div className="grid grid-cols-6 gap-0.5 px-1">
              {([["left", AlignStartVertical, "Align left"], ["hcenter", AlignCenterVertical, "Align centers horizontally"], ["right", AlignEndVertical, "Align right"],
                ["top", AlignStartHorizontal, "Align top"], ["vcenter", AlignCenterHorizontal, "Align middles vertically"], ["bottom", AlignEndHorizontal, "Align bottom"]] as const).map(([m, Icon, l]) => (
                <button key={m} title={l} onClick={() => align(m)} className="flex justify-center rounded-md p-1.5 hover:bg-slate-100"><Icon size={16} /></button>
              ))}
            </div>
            {movable.length >= 3 && (<>
              <button className={item} title="Distribute horizontally" onClick={() => distribute("x")}><AlignHorizontalDistributeCenter size={15} /> Space evenly across</button>
              <button className={item} title="Distribute vertically" onClick={() => distribute("y")}><AlignVerticalDistributeCenter size={15} /> Space evenly down</button>
            </>)}
            <div className="my-1 border-t border-slate-100" />
          </>)}
          <button className={item} title="Bring to front" onClick={front}><ArrowUpToLine size={15} /> Bring to front</button>
          <button className={item} title="Send to back" onClick={back}><ArrowDownToLine size={15} /> Send to back</button>
        </div>
      </Drop>
      {movable.length >= 2 && (
        <Drop id="cluster" open={open} setOpen={setOpen} title="Cluster: tidy up the selection" trigger={<LayoutGrid size={16} />}>
          <div className="w-60 p-1">
            <button className={item} onClick={() => { api.updateMany(tidyGrid(movable)); setOpen(null); }}><Grid3x3 size={15} /> Tidy into a grid</button>
            <button className={item} onClick={() => { api.updateMany(clusterByColor(movable)); setOpen(null); }}><Palette size={15} /> Cluster by color</button>
            {onAiCluster && (
              <button className={item} disabled={textual.length < 2} title={textual.length < 2 ? "Select at least two items with text" : undefined}
                onClick={() => { setOpen(null); onAiCluster(); }}><Sparkles size={15} className="text-violet-600" /> Cluster by theme (AI)</button>
            )}
          </div>
        </Drop>
      )}
      {(selected.length >= 2 || hasGroups) && (
        isGroup || (hasGroups && selected.length === 1)
          ? <button className="rounded-md p-1.5 hover:bg-slate-100" title="Ungroup (Ctrl+Shift+G)" onClick={ungroup}><Ungroup size={16} /></button>
          : <button className="rounded-md p-1.5 hover:bg-slate-100" title="Group (Ctrl+G)" onClick={group}><GroupIcon size={16} /></button>
      )}
      {sep}
      <button className="rounded-md p-1.5 hover:bg-slate-100" title={locked ? "Unlock" : "Lock"} onClick={() => setAll({ locked: !locked })}>
        {locked ? <Unlock size={16} /> : <Lock size={16} />}
      </button>
      <button className="rounded-md p-1.5 hover:bg-slate-100" title="Duplicate (Ctrl+D)" onClick={onDuplicate}><Copy size={16} /></button>
      <button className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50" title="Delete" onClick={onDelete}><Trash2 size={16} /></button>
    </div>
  );
}

const TYPE_NAMES: Partial<Record<BoardElement["type"], string>> = {
  sticky: "Sticky notes", rect: "Rectangles", ellipse: "Ellipses", diamond: "Diamonds", shape: "Shapes", text: "Text", connector: "Connectors",
  pen: "Drawings", image: "Images", frame: "Frames", dimension: "Measurements", area: "Areas", wall: "Walls", cloud: "Revision clouds",
  symbol: "Plan symbols", card: "Task cards", table: "Tables", topic: "Mind map topics", embed: "Links and embeds", video: "Videos",
  sticker: "Stickers", doc: "Documents",
};

const CONNECTOR_PATHS: Record<ConnectorStyle, string> = { straight: "M4 18 L18 4", curved: "M4 18 C12 18 10 4 18 4", elbow: "M4 18 L11 18 L11 4 L18 4" };

/** A button in the selection bar that opens a small panel underneath it. */
function Drop({ id, open, setOpen, title, trigger, children }: {
  id: string; open: string | null; setOpen: (v: string | null) => void; title: string; trigger: React.ReactNode; children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="relative">
      <button title={title} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}
        className={`flex h-8 items-center gap-0.5 rounded-md px-1.5 ${isOpen ? "bg-slate-100" : "hover:bg-slate-100"}`}>
        {trigger}<ChevronDown size={12} className="text-slate-400" />
      </button>
      {isOpen && (
        <div className="card fixed left-1/2 top-[7.5rem] z-30 max-h-[70vh] -translate-x-1/2 overflow-y-auto p-0 sm:absolute sm:left-0 sm:top-10 sm:translate-x-0">
          {children}
        </div>
      )}
    </div>
  );
}
