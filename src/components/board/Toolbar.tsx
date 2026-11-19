"use client";

import { useState } from "react";
import {
  MousePointer2, Hand, StickyNote, Type, Square, Circle, Diamond, Spline, PenLine, Frame, ImagePlus, MessageSquarePlus,
  SquareKanban, Table2, Network, Link2, Shapes, Smile, FileText,
} from "lucide-react";
import { SHAPES } from "@/lib/board/shapes";
import type { Tool } from "./Canvas";

type Item = { id: Tool; label: string; key: string; icon: typeof Square; edit?: boolean };

const TOOLS: Item[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Pan", key: "H", icon: Hand },
  { id: "sticky", label: "Sticky note", key: "N", icon: StickyNote, edit: true },
  { id: "card", label: "Task card", key: "D", icon: SquareKanban, edit: true },
  { id: "text", label: "Text", key: "T", icon: Type, edit: true },
];
const TOOLS_2: Item[] = [
  { id: "connector", label: "Connector", key: "L", icon: Spline, edit: true },
  { id: "pen", label: "Pen", key: "P", icon: PenLine, edit: true },
  { id: "frame", label: "Frame", key: "F", icon: Frame, edit: true },
  { id: "table", label: "Table", key: "", icon: Table2, edit: true },
  { id: "mindmap", label: "Mind map (Tab adds a branch, Enter a sibling)", key: "G", icon: Network, edit: true },
];

function ShapeIcon({ path }: { path: (w: number, h: number) => string }) {
  return <svg width="22" height="18" viewBox="-1 -1 24 20"><path d={path(22, 18)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

export function Toolbar({
  tool, setTool, canEdit, canComment, onImage, onEmbed, placingShape, setPlacingShape, onStickers, stickersOpen, onDoc,
}: {
  tool: Tool; setTool: (t: Tool) => void; canEdit: boolean; canComment: boolean; onImage: () => void; onEmbed: () => void;
  placingShape: string; setPlacingShape: (s: string) => void; onStickers?: () => void; stickersOpen?: boolean; onDoc?: () => void;
}) {
  const [shapesOpen, setShapesOpen] = useState(false);
  const btn = (active: boolean) =>
    `flex h-10 w-10 items-center justify-center rounded-lg transition ${active ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100"}`;
  const render = (items: Item[]) => items.filter((t) => !t.edit || canEdit).map((t) => (
    <button key={t.id} className={btn(tool === t.id)} title={`${t.label}${t.key ? ` (${t.key})` : ""}`} onClick={() => { setTool(t.id); setShapesOpen(false); }}>
      <t.icon size={18} />
    </button>
  ));
  const shapeActive = tool === "rect" || tool === "ellipse" || tool === "diamond" || tool === "shape";

  return (
    <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
      {render(TOOLS)}
      {canEdit && (
        <div className="relative">
          <button className={btn(shapeActive || shapesOpen)} title="Shapes (R rectangle, O ellipse)" onClick={() => setShapesOpen((o) => !o)}>
            <Shapes size={18} />
          </button>
          {shapesOpen && (
            <div className="card absolute left-12 top-0 grid w-52 grid-cols-4 gap-1 p-1.5">
              {([["rect", Square, "Rectangle"], ["ellipse", Circle, "Ellipse"], ["diamond", Diamond, "Diamond"]] as const).map(([id, Icon, name]) => (
                <button key={id} title={name} className={btn(tool === id)} onClick={() => { setTool(id); setShapesOpen(false); }}><Icon size={18} /></button>
              ))}
              {SHAPES.map((s) => (
                <button key={s.id} title={s.name} className={btn(tool === "shape" && placingShape === s.id)}
                  onClick={() => { setPlacingShape(s.id); setTool("shape"); setShapesOpen(false); }}>
                  <ShapeIcon path={s.path} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {render(TOOLS_2)}
      {canEdit && (
        <>
          <button className={btn(false)} title="New document" onClick={onDoc}><FileText size={18} /></button>
          <button className={btn(!!stickersOpen)} title="Stickers, emojis and GIFs" onClick={onStickers}><Smile size={18} /></button>
          <button className={btn(false)} title="Images, PDFs and videos" onClick={onImage}><ImagePlus size={18} /></button>
          <button className={btn(false)} title="Embed a link, video, Figma file… (or paste a URL)" onClick={onEmbed}><Link2 size={18} /></button>
        </>
      )}
      {canComment && (
        <button className={btn(tool === "comment")} title="Comment (C)" onClick={() => setTool("comment")}><MessageSquarePlus size={18} /></button>
      )}
    </div>
  );
}
