"use client";

import {
  MousePointer2, Hand, StickyNote, Type, Square, Circle, Diamond, Spline, PenLine, Frame, ImagePlus, MessageSquarePlus, Undo2, Redo2,
} from "lucide-react";
import type { Tool } from "./Canvas";

const TOOLS: { id: Tool; label: string; key: string; icon: typeof Square; edit?: boolean }[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Pan", key: "H", icon: Hand },
  { id: "sticky", label: "Sticky note", key: "N", icon: StickyNote, edit: true },
  { id: "text", label: "Text", key: "T", icon: Type, edit: true },
  { id: "rect", label: "Rectangle", key: "R", icon: Square, edit: true },
  { id: "ellipse", label: "Ellipse", key: "O", icon: Circle, edit: true },
  { id: "diamond", label: "Diamond", key: "", icon: Diamond, edit: true },
  { id: "connector", label: "Connector", key: "L", icon: Spline, edit: true },
  { id: "pen", label: "Pen", key: "P", icon: PenLine, edit: true },
  { id: "frame", label: "Frame", key: "F", icon: Frame, edit: true },
  { id: "comment", label: "Comment", key: "C", icon: MessageSquarePlus },
];

export function Toolbar({
  tool, setTool, canEdit, canComment, onImage, onUndo, onRedo,
}: {
  tool: Tool; setTool: (t: Tool) => void; canEdit: boolean; canComment: boolean; onImage: () => void; onUndo: () => void; onRedo: () => void;
}) {
  const btn = (active: boolean) =>
    `flex h-10 w-10 items-center justify-center rounded-lg transition ${active ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100"}`;
  return (
    <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
      {TOOLS.filter((t) => (!t.edit || canEdit) && (t.id !== "comment" || canComment)).map((t) => (
        <button key={t.id} className={btn(tool === t.id)} title={`${t.label}${t.key ? ` (${t.key})` : ""}`} onClick={() => setTool(t.id)}>
          <t.icon size={18} />
        </button>
      ))}
      {canEdit && (
        <>
          <button className={btn(false)} title="Image" onClick={onImage}><ImagePlus size={18} /></button>
          <div className="my-1 h-px bg-slate-200" />
          <button className={btn(false)} title="Undo (Ctrl+Z)" onClick={onUndo}><Undo2 size={18} /></button>
          <button className={btn(false)} title="Redo (Ctrl+Shift+Z)" onClick={onRedo}><Redo2 size={18} /></button>
        </>
      )}
    </div>
  );
}
