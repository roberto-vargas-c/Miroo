"use client";

import { useState } from "react";
import { FileUp, Ruler, Square as AreaIcon, BrickWall, Cloud, Highlighter, Shapes, Scale, X } from "lucide-react";
import { SYMBOLS, UNITS, type SymbolDef, type Unit } from "@/lib/board/arch";
import type { Tool } from "./Canvas";

export function SymbolPreview({ def, size = 40 }: { def: SymbolDef; size?: number }) {
  const [w, h] = def.vb;
  const pad = Math.max(w, h) * 0.06;
  return (
    <svg width={size} height={size} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} aria-hidden>
      <path d={def.d} fill={def.fill ?? "none"} stroke="#111827" strokeWidth={Math.max(w, h) / 40} strokeLinejoin="round" />
    </svg>
  );
}

const ARCH_TOOLS: { id: Tool; label: string; key: string; icon: typeof Ruler }[] = [
  { id: "calibrate", label: "Set scale: draw over a known dimension", key: "K", icon: Scale },
  { id: "measure", label: "Measure length", key: "M", icon: Ruler },
  { id: "area", label: "Measure area", key: "A", icon: AreaIcon },
  { id: "wall", label: "Wall (Shift snaps angles)", key: "W", icon: BrickWall },
  { id: "cloud", label: "Revision cloud", key: "Q", icon: Cloud },
  { id: "highlighter", label: "Highlighter", key: "I", icon: Highlighter },
];

export function ArchToolbar({
  tool, setTool, onImportPlan, importing, placingSymbol, setPlacingSymbol, unit, setUnit, scaleText,
}: {
  tool: Tool; setTool: (t: Tool) => void; onImportPlan: () => void; importing: string | null;
  placingSymbol: string | null; setPlacingSymbol: (id: string | null) => void;
  unit: Unit; setUnit: (u: Unit) => void; scaleText: string;
}) {
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const btn = (active: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-lg transition ${active ? "bg-rose-700 text-white" : "text-slate-700 hover:bg-slate-100"}`;
  const groups = Array.from(new Set(SYMBOLS.map((s) => s.group)));

  return (
    <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
      {symbolsOpen && (
        <div className="card absolute bottom-14 left-1/2 max-h-[60vh] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Plan symbols</h3>
            <button className="btn-ghost p-1" onClick={() => setSymbolsOpen(false)}><X size={14} /></button>
          </div>
          <p className="mb-2 text-xs text-slate-500">Pick a symbol, then click on the plan. It's sized to real dimensions when the plan has a scale.</p>
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{g}</div>
              <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
                {SYMBOLS.filter((s) => s.group === g).map((s) => (
                  <button key={s.id} title={`${s.name} (${s.size[0]} × ${s.size[1]} m)`}
                    className={`flex flex-col items-center gap-1 rounded-lg p-1.5 text-[10px] leading-tight hover:bg-slate-100 ${placingSymbol === s.id && tool === "symbol" ? "bg-rose-50 ring-1 ring-rose-300" : ""}`}
                    onClick={() => { setPlacingSymbol(s.id); setTool("symbol"); setSymbolsOpen(false); }}>
                    <SymbolPreview def={s} size={36} />
                    <span className="text-center text-slate-600">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
        <button className="btn-ghost h-9 px-2.5 text-sm" title="Import a PDF or image plan" onClick={onImportPlan} disabled={!!importing}>
          <FileUp size={16} /> <span className="hidden sm:inline">{importing ?? "Import plan"}</span>
        </button>
        <div className="mx-0.5 h-6 w-px bg-slate-200" />
        {ARCH_TOOLS.map((t) => (
          <button key={t.id} className={btn(tool === t.id)} title={`${t.label} (${t.key})`} onClick={() => setTool(t.id)}>
            <t.icon size={17} />
          </button>
        ))}
        <button className={btn(symbolsOpen || tool === "symbol")} title="Plan symbols: doors, windows, furniture…" onClick={() => setSymbolsOpen((o) => !o)}>
          <Shapes size={17} />
        </button>
        <div className="mx-0.5 h-6 w-px bg-slate-200" />
        <span className="hidden max-w-[16ch] truncate px-1 text-xs text-slate-500 md:inline" title={scaleText}>{scaleText}</span>
        <select className="rounded-md border border-slate-200 px-1 py-1 text-xs" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} title="Units">
          {UNITS.map((u) => <option key={u.id} value={u.id}>{u.id === "ft" ? "ft-in" : u.id}</option>)}
        </select>
      </div>
    </div>
  );
}

