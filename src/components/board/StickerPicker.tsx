"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Upload, X } from "lucide-react";
import { EMOJI_GROUPS, STICKER_PACKS, STICKER_BY_ID, stickerUrl } from "@/lib/board/stickers";

export type StickerPick = { kind: "sticker"; id: string } | { kind: "emoji"; id: string } | { kind: "gif"; id: string };
export const STICKER_DRAG_TYPE = "application/x-schema-sticker";

const RECENT_KEY = "schema.recentStickers";
const readRecent = (): StickerPick[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
};
const writeRecent = (r: StickerPick[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* private mode */ } };
const same = (a: StickerPick, b: StickerPick) => a.kind === b.kind && a.id === b.id;

type Tab = "all" | "stickers" | "emojis" | "gifs";

/** Sticker, emoji and GIF picker. Click to add at the center of the view, or drag onto the board. */
export function StickerPicker({ gifs, onPick, onUploadGif, onClose }: {
  /** Animated GIFs already on this board (their asset URLs). */
  gifs: string[];
  onPick: (p: StickerPick) => void;
  onUploadGif: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [recent, setRecent] = useState<StickerPick[]>([]);
  useEffect(() => setRecent(readRecent()), []);
  const scroller = useRef<HTMLDivElement>(null);

  const pick = (p: StickerPick) => {
    const next = [p, ...recent.filter((r) => !same(r, p))].slice(0, 16);
    setRecent(next); writeRecent(next);
    onPick(p);
  };
  const jump = (id: string) => scroller.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const item = (p: StickerPick, key?: string) => {
    const common = {
      key: key ?? `${p.kind}:${p.id}`,
      draggable: true,
      onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(STICKER_DRAG_TYPE, JSON.stringify(p)); e.dataTransfer.effectAllowed = "copy"; },
      onClick: () => pick(p),
    };
    if (p.kind === "emoji") {
      return <button {...common} title="Add emoji" className="flex h-10 w-10 items-center justify-center rounded-lg text-[26px] leading-none hover:bg-slate-100">{p.id}</button>;
    }
    const src = p.kind === "sticker" ? stickerUrl(p.id) ?? "" : p.id;
    const label = p.kind === "sticker" ? STICKER_BY_ID.get(p.id)?.label : "GIF";
    return (
      <button {...common} title={label} className="flex aspect-square items-center justify-center rounded-xl p-1 transition hover:scale-105 hover:bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label ?? ""} className="max-h-full max-w-full object-contain" draggable={false} />
      </button>
    );
  };

  const showStickers = tab === "all" || tab === "stickers";
  const showEmojis = tab === "all" || tab === "emojis";
  const showGifs = tab === "all" || tab === "gifs";
  const visibleRecent = useMemo(() => recent.filter((r) =>
    (r.kind === "sticker" && showStickers && STICKER_BY_ID.has(r.id)) || (r.kind === "emoji" && showEmojis) || (r.kind === "gif" && showGifs && gifs.includes(r.id))), [recent, showStickers, showEmojis, showGifs, gifs]);

  return (
    <div className="card absolute bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+3.75rem)] left-3 right-3 z-20 flex h-[min(420px,55vh)] flex-col overflow-hidden sm:bottom-auto sm:left-16 sm:right-auto sm:top-1/2 sm:ml-2 sm:h-[min(560px,80vh)] sm:w-[340px] sm:-translate-y-1/2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 border-b border-slate-100 px-3 pt-3 pb-2">
        {(["all", "stickers", "emojis", "gifs"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}>
            {t === "all" ? "All" : t === "gifs" ? "GIFs" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button className="btn-ghost ml-auto p-1.5" title="Close" onClick={onClose}><X size={16} /></button>
      </div>
      {showStickers && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-3 py-2">
          <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100" title="Recent" onClick={() => jump("recent")}><Clock size={18} /></button>
          {STICKER_PACKS.map((p) => (
            <button key={p.id} title={p.name} onClick={() => jump(p.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg p-0.5 hover:bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stickerUrl(p.stickers[0].id) ?? ""} alt={p.name} className="max-h-full" />
            </button>
          ))}
        </div>
      )}
      <div ref={scroller} className="flex-1 overflow-y-auto px-3 pb-4">
        <section data-section="recent">
          <div className="mt-3 mb-1 flex items-center justify-between">
            <h3 className="text-sm text-slate-500">Recent</h3>
            {recent.length > 0 && <button className="text-sm font-semibold text-slate-700 hover:underline" onClick={() => { setRecent([]); writeRecent([]); }}>Clear</button>}
          </div>
          {visibleRecent.length
            ? <div className="grid grid-cols-4 gap-1">{visibleRecent.map((r) => item(r, `recent:${r.kind}:${r.id}`))}</div>
            : <p className="py-2 text-xs text-slate-400">Stickers you use show up here.</p>}
        </section>
        {showStickers && STICKER_PACKS.map((p) => (
          <section key={p.id} data-section={p.id}>
            <h3 className="mt-4 mb-1 text-sm text-slate-500">{p.name}</h3>
            <div className="grid grid-cols-4 gap-1">{p.stickers.map((s) => item({ kind: "sticker", id: s.id }))}</div>
          </section>
        ))}
        {showGifs && (
          <section data-section="gifs">
            <div className="mt-4 mb-1 flex items-center justify-between">
              <h3 className="text-sm text-slate-500">GIFs on this board</h3>
              <button className="flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline" onClick={onUploadGif}><Upload size={14} /> Upload GIF</button>
            </div>
            {gifs.length
              ? <div className="grid grid-cols-3 gap-1">{gifs.map((g) => item({ kind: "gif", id: g }))}</div>
              : <p className="py-2 text-xs text-slate-400">Upload a GIF or drop one on the board and it will play there.</p>}
          </section>
        )}
        {showEmojis && EMOJI_GROUPS.map((g) => (
          <section key={g.name}>
            <h3 className="mt-4 mb-1 text-sm text-slate-500">{g.name}</h3>
            <div className="grid grid-cols-7 gap-0.5">{g.emojis.map((e) => item({ kind: "emoji", id: e }))}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
