"use client";
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { BoardElement, ConnectorElement } from "@/lib/board/types";

/** Imports a whole Miro board through Miro's API with the person's own access token (used once, not stored). */
export function MiroDialog({ boardId, q, at, onImport, onClose }: {
  boardId: string; q: string; at: { x: number; y: number };
  onImport: (els: BoardElement[], note: string) => void; onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/import/miro${q}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ link, token }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Import failed");
      const els = j.elements as BoardElement[];
      if (!els.length) throw new Error("That board has nothing Schema can import");
      // Center the imported content on the current view.
      const placed = els.filter((x) => x.type !== "connector");
      const w = Math.max(...placed.map((x) => x.x + x.width)), h = Math.max(...placed.map((x) => x.y + x.height));
      const dx = at.x - w / 2, dy = at.y - h / 2, z = Date.now();
      const moved = els.map((x, i) => x.type === "connector"
        ? { ...x, z: z + i, from: { ...(x as ConnectorElement).from, x: (x as ConnectorElement).from.x + dx, y: (x as ConnectorElement).from.y + dy }, to: { ...(x as ConnectorElement).to, x: (x as ConnectorElement).to.x + dx, y: (x as ConnectorElement).to.y + dy } }
        : { ...x, x: x.x + dx, y: x.y + dy, z: x.type === "frame" ? z - 1000 + i : z + i });
      const skipped = Object.entries(j.skipped as Record<string, number>).filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}${n === 1 ? "" : "s"}`);
      const notes = [
        `Imported ${els.length} items from “${j.name}”.`,
        skipped.length ? `Skipped ${skipped.join(", ")}.` : "",
        j.imageFailures ? `${j.imageFailures} image${j.imageFailures === 1 ? "" : "s"} couldn't be copied.` : "",
        j.truncated ? "Only the first 3000 items were imported." : "",
      ].filter(Boolean).join(" ");
      setToken("");
      onImport(moved as BoardElement[], notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form className="card max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} onSubmit={run}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import a Miro board</h2>
          <button type="button" className="btn-ghost p-1" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600">
          Brings over sticky notes, shapes, text, frames, cards, images, links and connectors with their positions and colors.
          Drawings, tables, mind maps and comments aren&apos;t available through Miro&apos;s API.
        </p>
        <div>
          <label className="label" htmlFor="miro-link">Miro board link</label>
          <input id="miro-link" className="input" value={link} onChange={(e) => setLink(e.target.value)} required autoFocus
            placeholder="https://miro.com/app/board/…" />
        </div>
        <div>
          <label className="label" htmlFor="miro-token">Miro access token</label>
          <input id="miro-token" className="input font-mono" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
          <p className="mt-1 text-xs text-slate-500">Used for this import only. It isn&apos;t saved.</p>
        </div>
        <MiroTokenHelp />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? <><Loader2 size={16} className="animate-spin" /> Importing…</> : "Import"}</button>
        </div>
      </form>
    </div>
  );
}

/** Steps for getting a Miro access token, shared by the import and paste dialogs. */
export function MiroTokenHelp() {
  return (
    <details className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-700">How to get a token (once, about 2 minutes)</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>In Miro, open your profile picture → <b>Settings</b> → <b>Your apps</b>, and choose <b>Create new app</b> (accept the developer team prompt if Miro shows one).</li>
        <li>Under <b>Permissions</b>, tick <b>boards:read</b>.</li>
        <li>Click <b>Install app and get OAuth token</b>, pick the team that has the board, and copy the token it shows.</li>
      </ol>
      <p className="mt-2">You can keep the app and reuse the same token for other boards in that team.</p>
    </details>
  );
}

const TOKEN_KEY = "schema.miroToken";
let sessionToken: string | null = null;
/** The Miro token for pasting: kept in memory for this tab, or in this browser when the person chose that. */
export function getMiroToken(): string | null {
  if (sessionToken) return sessionToken;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setMiroToken(token: string | null, remember = false) {
  sessionToken = token;
  try {
    if (token && remember) localStorage.setItem(TOKEN_KEY, token);
    else if (!token) localStorage.removeItem(TOKEN_KEY);
  } catch { /* private window */ }
}

/** Asks for a Miro token (and the board link, when Miro's clipboard didn't say) to bring over copied files. */
export function MiroPasteDialog({ count, needBoard, error, onSubmit, onClose }: {
  count: number; needBoard: boolean; error?: string | null;
  onSubmit: (token: string, remember: boolean, link: string) => void; onClose: () => void;
}) {
  const [token, setToken] = useState("");
  const [link, setLink] = useState("");
  const [remember, setRemember] = useState(true);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form className="card max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSubmit(token.trim(), remember, link.trim()); }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Paste {count === 1 ? "a file" : `${count} files`} from Miro</h2>
          <button type="button" className="btn-ghost p-1" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600">
          Miro copies pictures, PDFs, videos and other files as a reference to the board, not the file itself.
          Schema can download them through Miro with your access token.
        </p>
        {needBoard && (
          <div>
            <label className="label" htmlFor="miro-paste-link">Link to the Miro board you copied from</label>
            <input id="miro-paste-link" className="input" value={link} onChange={(e) => setLink(e.target.value)} required placeholder="https://miro.com/app/board/…" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="miro-paste-token">Miro access token</label>
          <input id="miro-paste-token" className="input font-mono" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required autoFocus />
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember in this browser so the next paste just works
          </label>
          <p className="mt-1 text-xs text-slate-500">The token stays in your browser. Schema&apos;s server uses it only to fetch the files and never saves it.</p>
        </div>
        <MiroTokenHelp />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">Paste</button>
        </div>
      </form>
    </div>
  );
}
