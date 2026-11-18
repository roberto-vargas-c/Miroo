"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, MessageCircle, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { Camera } from "./geometry";

type Author = { id: string; name: string; color: string };
export type CommentT = {
  id: string; x: number; y: number; body: string; resolved: boolean; createdAt: string; author: Author; replies?: CommentT[];
};

export function useComments(boardId: string, share: string | null) {
  const q = share ? `?share=${encodeURIComponent(share)}` : "";
  const [comments, setComments] = useState<CommentT[]>([]);
  const load = useCallback(async () => {
    const r = await fetch(`/api/boards/${boardId}/comments${q}`);
    if (r.ok) setComments((await r.json()).comments);
  }, [boardId, q]);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);
  const send = async (data: { body: string; x?: number; y?: number; parentId?: string }) => {
    const r = await fetch(`/api/boards/${boardId}/comments${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    await load();
    return r.ok ? (await r.json()).comment as CommentT : null;
  };
  const patch = async (id: string, data: { resolved?: boolean }) => {
    await fetch(`/api/comments/${id}${q}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    await load();
  };
  const remove = async (id: string) => { await fetch(`/api/comments/${id}${q}`, { method: "DELETE" }); await load(); };
  return { comments, send, patch, remove };
}

export function CommentPins({
  comments, camera, activeId, onOpen, draft, showResolved,
}: {
  comments: CommentT[]; camera: Camera; activeId: string | null; onOpen: (id: string) => void; draft: { x: number; y: number } | null; showResolved: boolean;
}) {
  const pos = (x: number, y: number) => ({ left: x * camera.scale + camera.x, top: y * camera.scale + camera.y });
  return (
    <>
      {comments.filter((c) => showResolved || !c.resolved).map((c) => (
        <button key={c.id} onPointerDown={(e) => e.stopPropagation()} onClick={() => onOpen(c.id)}
          className={`absolute z-[5] flex -translate-y-full items-center justify-center rounded-full rounded-bl-none border-2 border-white shadow-md transition hover:scale-110 ${activeId === c.id ? "scale-110 ring-2 ring-brand-500" : ""} ${c.resolved ? "opacity-50" : ""}`}
          style={{ ...pos(c.x, c.y), background: c.author.color, width: 30, height: 30 }} title={`${c.author.name}: ${c.body}`}>
          <span className="text-[11px] font-bold text-white">{(c.replies?.length ?? 0) + 1}</span>
        </button>
      ))}
      {draft && (
        <div className="absolute z-[5] -translate-y-full rounded-full rounded-bl-none border-2 border-white bg-brand-600 p-1.5 shadow-md" style={pos(draft.x, draft.y)}>
          <MessageCircle size={16} color="white" />
        </div>
      )}
    </>
  );
}

export function CommentPanel({
  comments, activeId, setActiveId, draft, setDraft, api, meId, canEdit, signedIn, showResolved, setShowResolved, onClose, onFocus,
}: {
  comments: CommentT[]; activeId: string | null; setActiveId: (id: string | null) => void;
  draft: { x: number; y: number } | null; setDraft: (d: { x: number; y: number } | null) => void;
  api: ReturnType<typeof useComments>; meId: string | null; canEdit: boolean; signedIn: boolean;
  showResolved: boolean; setShowResolved: (b: boolean) => void; onClose: () => void; onFocus: (c: CommentT) => void;
}) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const visible = comments.filter((c) => showResolved || !c.resolved);

  return (
    <aside className="absolute bottom-3 right-3 top-16 z-20 flex w-80 max-w-[calc(100vw-24px)] flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-3">
        <h2 className="font-semibold">Comments</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Resolved
          </label>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
      </div>

      {draft && (
        <form className="space-y-2 border-b border-slate-100 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const c = await api.send({ body: text, x: draft.x, y: draft.y });
            setText(""); setDraft(null);
            if (c) setActiveId(c.id);
          }}>
          <textarea autoFocus className="input h-20 resize-none" placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost py-1" onClick={() => setDraft(null)}>Cancel</button>
            <button className="btn-primary py-1">Comment</button>
          </div>
        </form>
      )}

      {!signedIn && <p className="p-3 text-xs text-slate-500">Sign in to add comments.</p>}

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 && !draft && (
          <p className="p-6 text-center text-sm text-slate-500">No comments yet. Pick the comment tool and click anywhere on the board.</p>
        )}
        {visible.map((c) => {
          const open = activeId === c.id;
          return (
            <div key={c.id} className={`border-b border-slate-100 p-3 ${open ? "bg-brand-50/60" : ""}`}>
              <button className="w-full text-left" onClick={() => { setActiveId(open ? null : c.id); onFocus(c); }}>
                <CommentBody c={c} />
              </button>
              {open && (
                <div className="mt-2 space-y-2 pl-9">
                  {c.replies?.map((r) => (
                    <div key={r.id} className="group flex items-start gap-1">
                      <div className="flex-1"><CommentBody c={r} small /></div>
                      {r.author.id === meId && (
                        <button className="opacity-0 group-hover:opacity-100" title="Delete" onClick={() => api.remove(r.id)}><Trash2 size={12} /></button>
                      )}
                    </div>
                  ))}
                  {signedIn && (
                    <form onSubmit={async (e) => { e.preventDefault(); if (!reply.trim()) return; await api.send({ body: reply, parentId: c.id }); setReply(""); }}>
                      <input className="input py-1 text-sm" placeholder="Reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
                    </form>
                  )}
                  <div className="flex gap-2">
                    {(canEdit || c.author.id === meId) && signedIn && (
                      <button className="btn-ghost py-1 text-xs" onClick={() => api.patch(c.id, { resolved: !c.resolved })}>
                        <Check size={12} /> {c.resolved ? "Reopen" : "Resolve"}
                      </button>
                    )}
                    {c.author.id === meId && (
                      <button className="btn-ghost py-1 text-xs text-rose-600" onClick={() => { api.remove(c.id); setActiveId(null); }}>
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function CommentBody({ c, small }: { c: CommentT; small?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <Avatar name={c.author.name} color={c.author.color} size={small ? 22 : 28} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500"><b className="font-medium text-slate-800">{c.author.name}</b> · {new Date(c.createdAt).toLocaleString()}</div>
        <div className={`whitespace-pre-wrap break-words ${small ? "text-sm" : "text-sm"} ${c.resolved ? "text-slate-400 line-through" : ""}`}>{c.body}</div>
      </div>
    </div>
  );
}
