"use client";

import { useState, useTransition } from "react";
import { Check, Copy, X } from "lucide-react";
import type { BoardVisibility, LinkAccess } from "@prisma/client";
import { updateBoardSharing } from "@/app/actions/workspace";

export type Sharing = { linkAccess: LinkAccess; visibility: BoardVisibility; teamId: string | null; shareToken: string };

export function ShareDialog({
  boardId, initial, teams, canManage, onClose,
}: {
  boardId: string; initial: Sharing; teams: { id: string; name: string }[]; canManage: boolean; onClose: () => void;
}) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<"board" | "link" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const memberUrl = `${origin}/board/${boardId}`;
  const shareUrl = `${memberUrl}?share=${s.shareToken}`;

  const save = (patch: Parameters<typeof updateBoardSharing>[1]) =>
    start(async () => { const r = await updateBoardSharing(boardId, patch); setS({ ...r }); });
  const copy = (what: "board" | "link", url: string) => { navigator.clipboard.writeText(url); setCopied(what); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-5 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share board</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={18} /></button>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Who in the workspace can open it</h3>
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" disabled={!canManage || pending} value={s.visibility}
              onChange={(e) => save({ visibility: e.target.value as BoardVisibility, teamId: e.target.value === "TEAM" ? s.teamId ?? teams[0]?.id ?? null : s.teamId })}>
              <option value="WORKSPACE">Everyone in the workspace</option>
              <option value="TEAM" disabled={!teams.length}>Only a team</option>
              <option value="PRIVATE">Only me (and admins)</option>
            </select>
            {s.visibility === "TEAM" && (
              <select className="input w-auto" disabled={!canManage || pending} value={s.teamId ?? ""} onChange={(e) => save({ teamId: e.target.value })}>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <button className="btn-outline py-1 text-xs" onClick={() => copy("board", memberUrl)}>
            {copied === "board" ? <Check size={12} /> : <Copy size={12} />} Copy link for members
          </button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Anyone with the link</h3>
          <select className="input" disabled={!canManage || pending} value={s.linkAccess} onChange={(e) => save({ linkAccess: e.target.value as LinkAccess })}>
            <option value="NONE">No access</option>
            <option value="VIEW">Can view</option>
            <option value="EDIT">Can edit</option>
          </select>
          {s.linkAccess !== "NONE" && (
            <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-2 text-sm">
              <code className="min-w-0 flex-1 truncate">{shareUrl}</code>
              <button className="btn-outline py-1" onClick={() => copy("link", shareUrl)}>
                {copied === "link" ? <Check size={14} /> : <Copy size={14} />} Copy
              </button>
            </div>
          )}
          {canManage && s.linkAccess !== "NONE" && (
            <button className="text-xs text-slate-500 underline" disabled={pending} onClick={() => save({ resetLink: true })}>
              Reset link (the old one stops working)
            </button>
          )}
          {!canManage && <p className="text-xs text-slate-500">Only the board owner or a workspace admin can change sharing.</p>}
        </section>
      </div>
    </div>
  );
}
