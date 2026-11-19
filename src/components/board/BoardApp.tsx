"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Download, Maximize, MessageSquare, Minus, Plus, Share2 } from "lucide-react";
import { makeElement, type BoardElement, type ImageElement } from "@/lib/board/types";
import { renameBoard } from "@/app/actions/workspace";
import { LogoMark } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { useBoard } from "./useBoard";
import type { CanvasHandle, Tool } from "./Canvas";
import type { Camera } from "./geometry";
import { Toolbar } from "./Toolbar";
import { PropertiesBar } from "./PropertiesBar";
import { ShareDialog, type Sharing } from "./ShareDialog";
import { CommentPanel, CommentPins, useComments } from "./Comments";

const Canvas = dynamic(() => import("./Canvas").then((m) => m.Canvas), { ssr: false });

export type BoardAppProps = {
  boardId: string;
  title: string;
  workspaceId: string | null;
  user: { id: string; name: string; color: string } | null;
  canEdit: boolean;
  canManage: boolean;
  shareToken: string | null;
  sharing: Sharing | null;
  teams: { id: string; name: string }[];
  realtimeUrl: string;
};

export function BoardApp(p: BoardAppProps) {
  const { elements, peers, status, synced, me, api } = useBoard(p.boardId, p.shareToken, p.realtimeUrl);
  const canEdit = p.canEdit && (me?.canEdit ?? p.canEdit);
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelectionState] = useState<string[]>([]);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [title, setTitle] = useState(p.title);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState<{ x: number; y: number } | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [penColor, setPenColor] = useState("#111827");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const comments = useComments(p.boardId, p.shareToken);

  const setSelection = useCallback((ids: string[]) => { setSelectionState(ids); api.setSelection(ids); }, [api]);

  // Fit the board to the screen once the first sync arrives.
  const fitted = useRef(false);
  useEffect(() => {
    if (!synced || fitted.current) return;
    // The canvas is loaded lazily, so wait until it has mounted.
    const tryFit = () => {
      if (!canvasRef.current) return void setTimeout(tryFit, 50);
      fitted.current = true;
      canvasRef.current.fitContent();
    };
    tryFit();
  }, [synced]);

  // Drop selection of elements that were deleted (possibly by someone else).
  useEffect(() => {
    const ids = new Set(elements.map((e) => e.id));
    if (selection.some((s) => !ids.has(s))) setSelection(selection.filter((s) => ids.has(s)));
  }, [elements, selection, setSelection]);

  const selected = useMemo(() => elements.filter((e) => selection.includes(e.id)), [elements, selection]);

  // ── Images ──
  const q = p.shareToken ? `?share=${encodeURIComponent(p.shareToken)}` : "";
  const addImageFile = useCallback(async (file: File, at?: { x: number; y: number }) => {
    if (!file.type.startsWith("image/")) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/boards/${p.boardId}/assets${q}`, { method: "POST", body: fd });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Upload failed"); return; }
    const { url } = await res.json();
    const img = new window.Image();
    img.onload = () => {
      const max = 480;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const w = img.width * k, h = img.height * k;
      const c = at ?? canvasRef.current?.viewportCenter() ?? { x: 0, y: 0 };
      const el = makeElement("image", c.x - w / 2, c.y - h / 2, { width: w, height: h, fill: "transparent", stroke: "transparent" }) as ImageElement;
      el.src = url;
      api.add([el]);
      setSelection([el.id]);
    };
    img.src = url;
  }, [api, p.boardId, q, setSelection]);

  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) return;
      const f = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (f) { e.preventDefault(); addImageFile(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canEdit, addImageFile]);

  const duplicateSelected = () => {
    const src = selected.filter((s) => s.type !== "connector");
    const copies: BoardElement[] = src.map((s) => ({ ...s, id: makeElement(s.type, 0, 0).id, x: s.x + 24, y: s.y + 24, z: Date.now() + Math.random() }));
    api.add(copies);
    setSelection(copies.map((c) => c.id));
  };

  const exportPng = () => {
    const url = canvasRef.current?.exportPng();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "board"}.png`;
    a.click();
  };

  if (status === "denied") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-sm p-6 text-center">
          <p>You don't have access to this board.</p>
          <Link href="/w" className="btn-primary mt-4">Go to my boards</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 select-none"
      onDragOver={(e) => { if (canEdit) e.preventDefault(); }}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
        if (f) {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
          addImageFile(f, { x: (sx - camera.x) / camera.scale, y: (sy - camera.y) / camera.scale });
        }
      }}>
      <Canvas
        ref={canvasRef}
        elements={elements}
        api={api}
        peers={peers}
        canEdit={canEdit}
        tool={tool}
        setTool={setTool}
        selection={selection}
        setSelection={setSelection}
        camera={camera}
        setCamera={setCamera}
        penColor={penColor}
        onComment={(pt) => { setCommentDraft(pt); setCommentsOpen(true); setActiveComment(null); }}
        overlay={<CommentPins comments={comments.comments} camera={camera} activeId={activeComment} draft={commentDraft} showResolved={showResolved}
          onOpen={(id) => { setActiveComment(id); setCommentsOpen(true); }} />}
      />

      {/* Top bar */}
      <header className="absolute left-3 right-3 top-3 z-10 flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-lg">
          <Link href={p.workspaceId ? `/w/${p.workspaceId}` : "/w"} className="btn-ghost p-1.5" title="Back to boards">
            <ChevronLeft size={18} /><LogoMark size={22} />
          </Link>
          <input
            className="min-w-0 max-w-[40vw] rounded-md bg-transparent px-2 py-1 text-sm font-medium outline-none hover:bg-slate-50 focus:bg-slate-50"
            value={title}
            disabled={!canEdit || !p.user}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title !== p.title) renameBoard(p.boardId, title).catch(() => setTitle(p.title)); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
          <span className={`mx-1 h-2 w-2 shrink-0 rounded-full ${status === "connected" ? "bg-emerald-500" : "bg-amber-400"}`}
            title={status === "connected" ? "Live" : "Reconnecting…"} />
          {!canEdit && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">View only</span>}
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-lg">
          <div className="flex -space-x-2">
            {me && <Avatar name={`${me.name} (you)`} color={me.color} size={28} />}
            {dedupePeers(peers).slice(0, 5).map((x) => <Avatar key={x.clientId} name={x.name} color={x.color} size={28} />)}
            {peers.length > 5 && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs ring-2 ring-white">+{peers.length - 5}</span>}
          </div>
          <button className={`btn-ghost p-1.5 ${commentsOpen ? "bg-slate-100" : ""}`} title="Comments" onClick={() => setCommentsOpen((o) => !o)}>
            <MessageSquare size={18} />
          </button>
          <button className="btn-ghost p-1.5" title="Export PNG" onClick={exportPng}><Download size={18} /></button>
          {p.sharing && <button className="btn-primary py-1.5" onClick={() => setShareOpen(true)}><Share2 size={16} /> Share</button>}
        </div>
      </header>

      <Toolbar tool={tool} setTool={setTool} canEdit={canEdit} canComment={!!p.user} onImage={() => fileRef.current?.click()} onUndo={api.undo} onRedo={api.redo} />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addImageFile(f); e.target.value = ""; }} />

      {tool === "pen" && (
        <div className="absolute left-16 top-1/2 z-10 ml-2 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {["#111827", "#0f8573", "#2563eb", "#db2777", "#ea580c", "#ca8a04"].map((c) => (
            <button key={c} onClick={() => setPenColor(c)} className={`h-6 w-6 rounded-full ${penColor === c ? "ring-2 ring-brand-500 ring-offset-1" : ""}`} style={{ background: c }} />
          ))}
        </div>
      )}

      {canEdit && <PropertiesBar selected={selected} all={elements} api={api} onDuplicate={duplicateSelected}
        onDelete={() => { api.remove(selection); setSelection([]); }} />}

      {/* Zoom */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
        <button className="btn-ghost p-1.5" title="Zoom out" onClick={() => canvasRef.current?.zoomBy(1 / 1.2)}><Minus size={16} /></button>
        <button className="w-14 text-center text-xs tabular-nums" title="Reset to 100%" onClick={() => canvasRef.current?.zoomTo(1)}>
          {Math.round(camera.scale * 100)}%
        </button>
        <button className="btn-ghost p-1.5" title="Zoom in" onClick={() => canvasRef.current?.zoomBy(1.2)}><Plus size={16} /></button>
        <button className="btn-ghost p-1.5" title="Fit to content" onClick={() => canvasRef.current?.fitContent()}><Maximize size={16} /></button>
      </div>

      {!synced && status !== "connected" && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white">Connecting…</div>
      )}
      {error && (
        <button className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white" onClick={() => setError(null)}>{error}</button>
      )}

      {commentsOpen && (
        <CommentPanel comments={comments.comments} activeId={activeComment} setActiveId={setActiveComment} draft={commentDraft} setDraft={setCommentDraft}
          api={comments} meId={p.user?.id ?? null} canEdit={canEdit} signedIn={!!p.user} showResolved={showResolved} setShowResolved={setShowResolved}
          onClose={() => { setCommentsOpen(false); setCommentDraft(null); }}
          onFocus={(c) => setCamera((cam) => ({ ...cam, x: window.innerWidth / 2 - c.x * cam.scale, y: window.innerHeight / 2 - c.y * cam.scale }))} />
      )}

      {shareOpen && p.sharing && (
        <ShareDialog boardId={p.boardId} initial={p.sharing} teams={p.teams} canManage={p.canManage} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

function dedupePeers<T extends { name: string; color: string }>(peers: T[]) {
  const seen = new Set<string>();
  return peers.filter((x) => { const k = x.name + x.color; if (seen.has(k)) return false; seen.add(k); return true; });
}
