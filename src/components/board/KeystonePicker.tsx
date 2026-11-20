"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Loader2 } from "lucide-react";

type Project = { id: string; name: string; city: string | null; modified: string | null; team: string | null };
type State = { configured: boolean; connected: boolean; account?: { name: string | null; email: string | null }; projects: Project[]; error?: string };

/**
 * "From Keystone" in the embed dialog: the person's Keystone projects (after Connect Keystone once); picking one puts its
 * live 3D model on the board. Hidden when this Schema has no Keystone (KEYSTONE_URL).
 */
export function KeystonePicker({ onPick }: { onPick: (url: string, name: string) => void }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/keystone/projects", { cache: "no-store" });
      const j = (await r.json()) as State;
      setS(j); setError(j.error ?? null);
    } catch { setS({ configured: true, connected: true, projects: [] }); setError("Couldn't reach Keystone. Try again"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connect = useCallback(() => {
    const w = window.open("/api/keystone/connect?popup=1", "schema-keystone-connect", "width=640,height=780");
    if (!w) { window.location.href = `/api/keystone/connect?next=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
    setBusy("connect");
    let done = false;
    const finish = (err?: string) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      setBusy(null);
      if (err) setError(err);
      void load();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "schema-keystone-connect") return;
      finish(e.data.ok ? undefined : e.data.error);
    };
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => { if (w.closed) finish(); }, 700);
  }, [load]);

  const pick = useCallback(async (p: Project) => {
    setBusy(p.id); setError(null);
    try {
      const r = await fetch(`/api/keystone/projects/${encodeURIComponent(p.id)}/embed`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Keystone made no embed link"); if (j.needsConnect) void load(); return; }
      onPick(j.url, p.name);
    } catch { setError("Couldn't reach Keystone. Try again"); } finally { setBusy(null); }
  }, [onPick, load]);

  if (!s?.configured && s) return null;
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Box size={15} /> 3D model from Keystone</h3>
        {s?.connected && s.account?.name && (
          <button type="button" className="text-xs text-slate-500 hover:underline" title="Disconnect Keystone"
            onClick={async () => { await fetch("/api/keystone/projects", { method: "DELETE" }).catch(() => {}); void load(); }}>
            {s.account.name} · Disconnect
          </button>
        )}
      </div>
      {!s ? (
        <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Looking for your projects…</p>
      ) : !s.connected ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Put a project&apos;s live 3D model on the board: it updates as your team works on it.</p>
          <button type="button" className="btn-ghost shrink-0 border border-slate-200" disabled={busy === "connect"} onClick={connect}>
            {busy === "connect" ? "Connecting…" : "Connect Keystone"}
          </button>
        </div>
      ) : s.projects.length === 0 && !error ? (
        <p className="text-xs text-slate-500">No projects in your Keystone account yet.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {s.projects.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={!!busy} onClick={() => pick(p)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 disabled:opacity-60">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">{[p.city, p.team].filter(Boolean).join(" · ") || " "}</span>
                </span>
                {busy === p.id ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <span className="shrink-0 text-xs text-brand-700">Add</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
