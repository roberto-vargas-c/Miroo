"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ellipsis, FileDown, FileImage, FileSpreadsheet, History, LayoutTemplate, RotateCcw, X, Eye, UserRound } from "lucide-react";
import type { BoardElement } from "@/lib/board/types";
import { parseCsv, csvToElements, CSV_LIMITS, type CsvMode } from "@/lib/board/csv";
import { saveBoardAsTemplate } from "@/app/actions/workspace";
import type { BoardApi } from "./useBoard";

export type ExportKind = "png" | "png-hi" | "pdf" | "pdf-frames";

// ── "More" menu: export, import, templates ──────────────────────────────────

export function BoardMenu({
  onExport, onImportCsv, onSaveTemplate, canEdit, canTemplate, frameCount, hasSelection, showAuthors, onToggleAuthors,
}: {
  onExport: (k: ExportKind) => void; onImportCsv: () => void; onSaveTemplate: () => void;
  canEdit: boolean; canTemplate: boolean; frameCount: number; hasSelection: boolean;
  showAuthors?: boolean; onToggleAuthors?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const item = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false, hint?: string) => (
    <button className="btn-ghost w-full justify-start gap-2 text-left" disabled={disabled} title={hint}
      onClick={() => { setOpen(false); onClick(); }}>
      {icon}<span className="flex-1">{label}</span>
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <button className={`btn-ghost p-1.5 ${open ? "bg-slate-100" : ""}`} title="Export, import and templates" onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={18} />
      </button>
      {open && (
        <div className="card absolute right-0 top-10 z-30 w-72 p-1">
          <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Export {hasSelection ? "selection" : "board"}
          </div>
          {item("Image (PNG)", <FileImage size={16} />, () => onExport("png"))}
          {item("High-resolution image (PNG)", <FileImage size={16} />, () => onExport("png-hi"))}
          {item("PDF", <FileDown size={16} />, () => onExport("pdf"))}
          {item(`PDF, one page per frame (${frameCount})`, <FileDown size={16} />, () => onExport("pdf-frames"), frameCount === 0,
            frameCount === 0 ? "Add frames to the board first" : "Each frame becomes a page, at its size on the board")}
          <div className="my-1 h-px bg-slate-100" />
          <div className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">View</div>
          {onToggleAuthors && item(showAuthors ? "Hide authors on sticky notes" : "Show authors on sticky notes", <UserRound size={16} />, onToggleAuthors)}
          {(canEdit || canTemplate) && <div className="my-1 h-px bg-slate-100" />}
          {canEdit && item("Import CSV…", <FileSpreadsheet size={16} />, onImportCsv)}
          {canTemplate && item("Save board as template…", <LayoutTemplate size={16} />, onSaveTemplate)}
        </div>
      )}
    </div>
  );
}

// ── CSV import ──────────────────────────────────────────────────────────────

export function CsvDialog({
  at, members, onImport, onClose,
}: {
  at: { x: number; y: number }; members: { id: string; name: string; color: string }[];
  onImport: (els: BoardElement[]) => void; onClose: () => void;
}) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<CsvMode>("sticky");
  const [hasHeader, setHasHeader] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const read = async (f: File) => {
    setError(null);
    if (f.size > 5 * 1024 * 1024) { setError("That file is over 5 MB."); return; }
    const parsed = parseCsv(await f.text());
    if (!parsed.length) { setError("No rows found in that file."); return; }
    setRows(parsed);
    setFileName(f.name);
    const head = parsed[0].map((h) => h.toLowerCase());
    if (head.some((h) => ["status", "estado", "assignee", "due", "owner"].includes(h))) setMode("card");
  };

  const count = rows ? (mode === "table" ? 1 : Math.min(CSV_LIMITS.rows, rows.length - (hasHeader ? 1 : 0))) : 0;
  const modes: { id: CsvMode; name: string; desc: string }[] = [
    { id: "sticky", name: "Sticky notes", desc: "One note per row" },
    { id: "card", name: "Task cards", desc: "Reads title, status, assignee and due date columns" },
    { id: "table", name: "Table", desc: `Up to ${CSV_LIMITS.tableRows} rows and ${CSV_LIMITS.tableCols} columns` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import CSV</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-200 p-4 text-sm text-slate-500 hover:border-brand-300">
          <FileSpreadsheet size={22} />
          {fileName ? <span className="font-medium text-slate-700">{fileName} · {rows?.length} rows</span> : "Choose a .csv or .tsv file (Excel and Google Sheets can export these)"}
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); }} />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {rows && (
          <>
            <div className="max-h-36 overflow-auto rounded-md border border-slate-100 text-xs">
              <table className="w-full">
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className={i === 0 && hasHeader ? "bg-slate-50 font-semibold" : ""}>
                      {r.slice(0, 6).map((c, j) => <td key={j} className="max-w-[10rem] truncate border-b border-slate-100 px-2 py-1">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> The first row is a header
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {modes.map((m) => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)}
                  className={`rounded-lg border p-2.5 text-left text-sm ${mode === m.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-slate-500">{m.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!rows || count <= 0}
            onClick={() => { if (rows) onImport(csvToElements(rows, mode, hasHeader, at, members)); }}>
            {mode === "table" ? "Add table" : `Add ${count} ${mode === "card" ? "card" : "note"}${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Save as template ────────────────────────────────────────────────────────

export function TemplateDialog({ boardId, title, elements, onDone, onClose }: {
  boardId: string; title: string; elements: BoardElement[]; onDone: (msg: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(title);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form className="card w-full max-w-md space-y-4 p-5" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBoardAsTemplate(boardId, { name, description, elements: JSON.stringify(elements) });
          if (r?.error) setError(r.error); else onDone(`Saved “${name.trim()}”. It's now in New board for everyone in this workspace.`);
        });
      }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Save as template</h2>
          <button type="button" className="btn-ghost p-1" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-500">Everyone in this workspace can start new boards from it. The board's {elements.length} items are copied as they are now.</p>
        <div>
          <label className="label" htmlFor="tpl-name">Name</label>
          <input id="tpl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} />
        </div>
        <div>
          <label className="label" htmlFor="tpl-desc">Description (optional)</label>
          <input id="tpl-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Client kickoff: brief, site photos, program" maxLength={200} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={pending || !name.trim()}>{pending ? "Saving…" : "Save template"}</button>
        </div>
      </form>
    </div>
  );
}

// ── Version history ─────────────────────────────────────────────────────────

type Version = { id: string; label: string | null; auto: boolean; elementCount: number; createdAt: string; by: string | null };

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function VersionPanel({
  boardId, q, api, previewing, onPreview, onRestored, onClose,
}: {
  boardId: string; q: string; api: BoardApi; previewing: string | null;
  onPreview: (v: { id: string; label: string; elements: BoardElement[] } | null) => void;
  onRestored: (msg: string) => void; onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/boards/${boardId}/versions`;
  const withQ = (path: string, extra = "") => `${path}${q}${extra ? (q ? "&" : "?") + extra : ""}`;

  const load = async () => {
    const r = await fetch(withQ(base));
    if (r.ok) setVersions((await r.json()).versions); else setError("Couldn't load the history.");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [boardId]);

  const save = async (name: string) => {
    const r = await fetch(withQ(base, `label=${encodeURIComponent(name)}`), {
      method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Blob([api.encodeState() as BlobPart]),
    });
    if (!r.ok) throw new Error("Couldn't save a version");
  };
  const fetchVersion = async (id: string) => {
    const r = await fetch(withQ(`${base}/${id}`));
    if (!r.ok) throw new Error("Couldn't open that version");
    return ((await r.json()).elements as BoardElement[]).sort((a, b) => a.z - b.z);
  };
  const name = (v: Version) => v.label ?? (v.auto ? "Autosave" : "Saved version");

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(null); }
  };

  return (
    <aside className="absolute right-3 top-16 z-20 flex max-h-[calc(100%-5rem)] w-80 max-w-[calc(100vw-24px)] flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-3">
        <h2 className="flex items-center gap-2 font-semibold"><History size={16} /> Version history</h2>
        <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
      </div>
      <form className="flex gap-2 border-b border-slate-100 p-3" onSubmit={(e) => {
        e.preventDefault();
        void run("save", async () => { await save(label.trim() || "Saved version"); setLabel(""); await load(); });
      }}>
        <input className="input py-1 text-sm" placeholder="Name this version, e.g. Sent to client" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
        <button className="btn-primary shrink-0 py-1 text-sm" disabled={!!busy}>Save</button>
      </form>
      {error && <p className="px-3 pt-2 text-sm text-rose-600">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!versions ? <p className="p-2 text-sm text-slate-500">Loading…</p>
          : versions.length === 0 ? <p className="p-2 text-sm text-slate-500">No versions yet. The board is saved automatically every 10 minutes while people edit, or save one now.</p>
          : (
            <ol className="space-y-1">
              {versions.map((v) => (
                <li key={v.id} className={`rounded-lg p-2 text-sm ${previewing === v.id ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${v.auto ? "bg-slate-300" : "bg-brand-500"}`} />
                    <span className={`min-w-0 flex-1 truncate ${v.auto ? "text-slate-600" : "font-medium"}`}>{name(v)}</span>
                    <button className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800" title="Preview" disabled={!!busy}
                      onClick={() => void run(v.id, async () => onPreview({ id: v.id, label: `${name(v)} · ${when(v.createdAt)}`, elements: await fetchVersion(v.id) }))}>
                      <Eye size={14} />
                    </button>
                    <button className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800" title="Restore this version" disabled={!!busy}
                      onClick={() => {
                        if (!window.confirm(`Restore “${name(v)}” from ${when(v.createdAt)}? The current board is saved as a version first, so you can go back.`)) return;
                        void run(v.id, async () => {
                          const els = await fetchVersion(v.id);
                          await save(`Before restoring ${when(v.createdAt)}`);
                          api.replaceAll(els);
                          onPreview(null);
                          onRestored(`Restored the version from ${when(v.createdAt)}.`);
                          await load();
                        });
                      }}>
                      <RotateCcw size={14} />
                    </button>
                  </div>
                  <div className="pl-4 text-xs text-slate-500">{when(v.createdAt)}{v.by ? ` · ${v.by}` : ""} · {v.elementCount} items</div>
                </li>
              ))}
            </ol>
          )}
      </div>
    </aside>
  );
}
