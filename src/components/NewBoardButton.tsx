"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createBoard } from "@/app/actions/workspace";
import { TEMPLATES } from "@/lib/board/templates";

export function NewBoardButton({ workspaceId, teams }: { workspaceId: string; teams: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState("blank");
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New board</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <form action={createBoard.bind(null, workspaceId)} className="card w-full max-w-2xl space-y-5 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New board</h2>
              <button type="button" className="btn-ghost p-1" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input className="input" id="title" name="title" placeholder="Untitled board" autoFocus />
            </div>
            <div>
              <span className="label">Start from</span>
              <input type="hidden" name="template" value={template} />
              <div className="grid gap-2 sm:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <button type="button" key={t.id} onClick={() => setTemplate(t.id)}
                    className={`rounded-lg border p-3 text-left text-sm transition ${template === t.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="teamId">Team</label>
              <select className="input" id="teamId" name="teamId" defaultValue="">
                <option value="">Whole workspace (everyone can see it)</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name} (team members only)</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary">Create board</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
