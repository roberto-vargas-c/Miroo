"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { createBoard, deleteTemplate } from "@/app/actions/workspace";
import { TEMPLATES } from "@/lib/board/templates";

export type CustomTemplate = { id: string; name: string; description: string; by: string; canDelete: boolean };

export function NewBoardButton({
  workspaceId, teams, folders = [], folderId = "", customTemplates = [],
}: {
  workspaceId: string; teams: { id: string; name: string }[];
  folders?: { id: string; name: string }[]; folderId?: string; customTemplates?: CustomTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState("blank");
  const [pending, start] = useTransition();
  const tile = (selected: boolean) =>
    `rounded-lg border p-3 text-left text-sm transition ${selected ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`;
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
                  <button type="button" key={t.id} onClick={() => setTemplate(t.id)} className={tile(template === t.id)}>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.description}</div>
                  </button>
                ))}
              </div>
              {customTemplates.length > 0 && (
                <>
                  <div className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Your workspace's templates</div>
                  <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-3">
                    {customTemplates.map((t) => (
                      <div key={t.id} role="button" tabIndex={0} onClick={() => setTemplate(`custom:${t.id}`)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setTemplate(`custom:${t.id}`); }}
                        className={`relative cursor-pointer ${tile(template === `custom:${t.id}`)}`}>
                        <div className="truncate pr-5 font-medium">{t.name}</div>
                        <div className="line-clamp-2 text-xs text-slate-500">{t.description || `By ${t.by}`}</div>
                        {t.canDelete && (
                          <button type="button" title="Delete template" disabled={pending}
                            className="absolute right-1.5 top-1.5 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!window.confirm(`Delete the template “${t.name}”? Boards made from it stay as they are.`)) return;
                              if (template === `custom:${t.id}`) setTemplate("blank");
                              start(() => deleteTemplate(t.id));
                            }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="label" htmlFor="teamId">Team</label>
              <select className="input" id="teamId" name="teamId" defaultValue="">
                <option value="">Whole workspace (everyone can see it)</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name} (team members only)</option>)}
              </select>
            </div>
            {folders.length > 0 && (
              <div>
                <label className="label" htmlFor="folderId">Folder</label>
                <select className="input" id="folderId" name="folderId" defaultValue={folderId}>
                  <option value="">No folder</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            )}
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
