"use client";

import { useState } from "react";
import { Sparkles, X, LayoutGrid, FileText, Lightbulb, Workflow, Network } from "lucide-react";
import type { BoardElement } from "@/lib/board/types";

export type AiItem = { id: string; text: string };
type Node = { id: string; label: string; kind: "start_end" | "step" | "decision" | "data"; parent: string };
export type AiResults = {
  cluster: { clusters: { title: string; ids: string[] }[] };
  summarize: { title: string; points: string[]; next_steps: string[] };
  ideas: { ideas: string[] };
  diagram: { nodes: Node[]; edges: { from: string; to: string; label: string }[] };
};

/** Board items whose text the AI can work with. */
export function textItems(els: BoardElement[]): AiItem[] {
  return els
    .filter((e) => e.type !== "connector" && e.type !== "frame" && e.type !== "image" && !e.privateOwner)
    .map((e) => ({ id: e.id, text: (e.type === "table" ? (e as unknown as { cells: string[][] }).cells.map((r) => r.join(" | ")).join("\n") : e.text ?? "").trim() }))
    .filter((i) => i.text);
}

export function AiPanel({
  enabled, boardId, q, selected, all, onCluster, onSummary, onIdeas, onDiagram, onClose,
}: {
  enabled: boolean; boardId: string; q: string; selected: BoardElement[]; all: BoardElement[];
  onCluster: (r: AiResults["cluster"]) => void; onSummary: (r: AiResults["summarize"]) => void;
  onIdeas: (r: AiResults["ideas"]) => void; onDiagram: (r: AiResults["diagram"], kind: "flowchart" | "mindmap") => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"flowchart" | "mindmap">("flowchart");
  const sel = textItems(selected);

  const call = async <K extends keyof AiResults>(action: K, payload: Record<string, unknown>, done: (r: AiResults[K]) => void) => {
    setBusy(action); setError(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/ai${q}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      done(data as AiResults[K]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };
  const working = (k: string, label: string) => (busy === k ? "Thinking…" : label);

  return (
    <aside className="absolute right-3 top-16 z-20 flex max-h-[calc(100%-5rem)] w-80 max-w-[calc(100vw-24px)] flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-3">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-violet-600" /> AI assist</h2>
        <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
      </div>
      {!enabled ? (
        <p className="p-4 text-sm text-slate-600">AI isn&apos;t set up on this server yet. An admin needs to add an Anthropic API key (<code>ANTHROPIC_API_KEY</code>).</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-sm">
          <section className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Selection · {sel.length} item{sel.length === 1 ? "" : "s"} with text
            </div>
            {sel.length === 0 && <p className="text-slate-500">Select sticky notes or other items on the board to group or summarize them.</p>}
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-outline justify-start" disabled={!!busy || sel.length < 2}
                title="Sort the selected notes into themes, each in its own frame"
                onClick={() => call("cluster", { items: sel }, onCluster)}>
                <LayoutGrid size={15} /> {working("cluster", "Group by theme")}
              </button>
              <button className="btn-outline justify-start" disabled={!!busy || sel.length < 1}
                title="Write a summary of the selection next to it"
                onClick={() => call("summarize", { items: sel }, onSummary)}>
                <FileText size={15} /> {working("summarize", "Summarize")}
              </button>
            </div>
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ideas</div>
            <input className="input py-1.5" value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder={sel.length === 1 ? `More like “${sel[0].text.slice(0, 40)}”` : "e.g. Ways to bring daylight into the basement"} />
            <button className="btn-outline w-full" disabled={!!busy || (!topic.trim() && sel.length !== 1)}
              onClick={() => call("ideas", { topic: topic.trim() || sel[0].text, items: (sel.length ? sel : textItems(all)).slice(0, 300) }, onIdeas)}>
              <Lightbulb size={15} /> {working("ideas", "Add idea notes")}
            </button>
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Diagram from text</div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              {([["flowchart", "Flowchart", Workflow], ["mindmap", "Mind map", Network]] as const).map(([k, label, Icon]) => (
                <button key={k} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 ${kind === k ? "bg-white shadow-sm" : "text-slate-600"}`}
                  onClick={() => setKind(k)}><Icon size={14} /> {label}</button>
              ))}
            </div>
            <textarea className="input min-h-24 resize-y py-1.5" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={kind === "flowchart" ? "e.g. Building permit process: prepare drawings, submit, city review, corrections if rejected, permit issued" : "e.g. Brief for a family house: rooms, materials, budget, site constraints"} />
            <button className="btn-primary w-full" disabled={!!busy || description.trim().length < 3}
              onClick={() => call("diagram", { description, kind }, (r) => onDiagram(r, kind))}>
              <Sparkles size={15} /> {working("diagram", `Create ${kind === "flowchart" ? "flowchart" : "mind map"}`)}
            </button>
          </section>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
          <p className="text-xs text-slate-400">The text of the items you use is sent to Anthropic&apos;s Claude to answer. Results are added to the board, and Undo removes them.</p>
        </div>
      )}
    </aside>
  );
}
