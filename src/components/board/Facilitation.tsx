"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Timer as TimerIcon, Vote, X, EyeOff, Eye, Plus, Trophy } from "lucide-react";
import type { BoardElement } from "@/lib/board/types";
import type { TimerState, VoteSession, PrivateMode } from "./useBoard";

// ── Timer ───────────────────────────────────────────────────────────────────

function fmt(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + d);
      o.stop(ctx.currentTime + d + 0.2);
    });
  } catch {
    /* audio not allowed */
  }
}

export function remainingMs(t: NonNullable<TimerState>, now = Date.now()) {
  return t.running ? Math.max(0, t.endsAt - now) : t.remainingMs;
}

export function TimerWidget({
  timer, canEdit, me, onChange,
}: {
  timer: TimerState; canEdit: boolean; me: string; onChange: (t: TimerState) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [setupOpen, setSetupOpen] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const rang = useRef<number | null>(null);

  useEffect(() => {
    if (!timer?.running) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [timer?.running]);

  const left = timer ? remainingMs(timer, now) : 0;
  const done = !!timer && timer.running && left <= 0;
  useEffect(() => {
    if (done && timer && rang.current !== timer.endsAt) {
      rang.current = timer.endsAt;
      beep();
    }
  }, [done, timer]);

  const start = (ms: number) => onChange({ running: true, endsAt: Date.now() + ms, remainingMs: ms, durationMs: ms, by: me });

  if (!timer) {
    if (!canEdit) return null;
    return (
      <div className="relative">
        <button className="btn-ghost p-1.5" title="Timer" onClick={() => setSetupOpen((o) => !o)}><TimerIcon size={18} /></button>
        {setupOpen && (
          <div className="card absolute right-0 top-10 z-30 w-56 space-y-2 p-3">
            <div className="text-sm font-medium">Start a timer for everyone</div>
            <div className="flex flex-wrap gap-1">
              {[1, 3, 5, 10, 15].map((m) => (
                <button key={m} className="btn-outline px-2 py-1 text-xs" onClick={() => { start(m * 60000); setSetupOpen(false); }}>{m} min</button>
              ))}
            </div>
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); start(minutes * 60000); setSetupOpen(false); }}>
              <input type="number" min={1} max={180} className="input py-1" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 1)} />
              <button className="btn-primary py-1">Start</button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${done ? "animate-pulse bg-rose-100 text-rose-700" : "bg-slate-100"}`}>
      <TimerIcon size={14} />
      <span className="min-w-[3ch]">{done ? "Time's up" : fmt(left)}</span>
      {canEdit && (
        <>
          {!done && (timer.running ? (
            <button title="Pause" className="rounded p-0.5 hover:bg-white" onClick={() => onChange({ ...timer, running: false, remainingMs: remainingMs(timer) })}><Pause size={14} /></button>
          ) : (
            <button title="Resume" className="rounded p-0.5 hover:bg-white" onClick={() => onChange({ ...timer, running: true, endsAt: Date.now() + timer.remainingMs })}><Play size={14} /></button>
          ))}
          <button title="Add a minute" className="rounded p-0.5 hover:bg-white"
            onClick={() => onChange(timer.running ? { ...timer, endsAt: Math.max(Date.now(), timer.endsAt) + 60000 } : { ...timer, remainingMs: timer.remainingMs + 60000 })}>
            <Plus size={14} />
          </button>
          <button title="Stop" className="rounded p-0.5 hover:bg-white" onClick={() => onChange(null)}><Square size={14} /></button>
        </>
      )}
    </div>
  );
}

// ── Voting ──────────────────────────────────────────────────────────────────

export function tallyVotes(votes: Map<string, string[]>, voteId: string) {
  const counts = new Map<string, number>();
  let voters = 0;
  for (const [k, ids] of votes) {
    if (!k.startsWith(`${voteId}|`)) continue;
    if (ids.length) voters++;
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { counts, voters };
}

export function VotePanel({
  vote, votes, myVotes, canEdit, me, elements, onStart, onEnd, onClear, onFocus, onClose,
}: {
  vote: VoteSession; votes: Map<string, string[]>; myVotes: string[]; canEdit: boolean; me: string; elements: BoardElement[];
  onStart: (v: NonNullable<VoteSession>) => void; onEnd: () => void; onClear: () => void; onFocus: (el: BoardElement) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState("Which ideas should we pursue?");
  const [perUser, setPerUser] = useState(3);
  const [anonymous, setAnonymous] = useState(true);
  const byId = new Map(elements.map((e) => [e.id, e]));

  return (
    <aside className="absolute right-3 top-16 z-20 w-80 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-3">
        <h2 className="flex items-center gap-2 font-semibold"><Vote size={16} /> Voting</h2>
        <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
      </div>
      {!vote && (
        canEdit ? (
          <form className="space-y-3 p-3" onSubmit={(e) => {
            e.preventDefault();
            onStart({ id: Math.random().toString(36).slice(2, 10), title: title.trim() || "Vote", votesPerUser: perUser, open: true, anonymous, by: me, startedAt: Date.now() });
          }}>
            <div>
              <label className="label">Question</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Votes per person</label>
              <input type="number" min={1} max={20} className="input" value={perUser} onChange={(e) => setPerUser(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Hide results until voting ends</label>
            <button className="btn-primary w-full">Start voting</button>
            <p className="text-xs text-slate-500">Everyone clicks items on the board to vote. Clicking again takes the vote back.</p>
          </form>
        ) : <p className="p-4 text-sm text-slate-500">No vote is running.</p>
      )}
      {vote?.open && (
        <div className="space-y-3 p-3">
          <p className="font-medium">{vote.title}</p>
          {canEdit ? (
            <p className="rounded-lg bg-brand-50 p-2 text-sm">
              Click items on the board to vote. You have <b>{vote.votesPerUser - myVotes.length}</b> of {vote.votesPerUser} votes left.
            </p>
          ) : (
            <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">You have view-only access, so you can watch but not vote.</p>
          )}
          <p className="text-xs text-slate-500">{tallyVotes(votes, vote.id).voters} people have voted so far.</p>
          {!vote.anonymous && <Results vote={vote} votes={votes} byId={byId} onFocus={onFocus} />}
          {canEdit && <button className="btn-outline w-full" onClick={onEnd}>End voting and show results</button>}
        </div>
      )}
      {vote && !vote.open && (
        <div className="space-y-3 p-3">
          <p className="font-medium">{vote.title}</p>
          <Results vote={vote} votes={votes} byId={byId} onFocus={onFocus} />
          {canEdit && <button className="btn-ghost w-full text-rose-600" onClick={onClear}>Clear results</button>}
        </div>
      )}
    </aside>
  );
}

function Results({ vote, votes, byId, onFocus }: {
  vote: NonNullable<VoteSession>; votes: Map<string, string[]>; byId: Map<string, BoardElement>; onFocus: (el: BoardElement) => void;
}) {
  const { counts, voters } = tallyVotes(votes, vote.id);
  const ranked = Array.from(counts.entries()).filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return <p className="text-sm text-slate-500">No votes yet.</p>;
  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{voters} voters</p>
      <ol className="max-h-72 space-y-1 overflow-y-auto">
        {ranked.map(([id, n], i) => {
          const el = byId.get(id)!;
          return (
            <li key={id}>
              <button className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm hover:bg-slate-50" onClick={() => onFocus(el)}>
                {i === 0 ? <Trophy size={14} className="text-amber-500" /> : <span className="w-3.5 text-center text-xs text-slate-400">{i + 1}</span>}
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: el.fill }} />
                <span className="min-w-0 flex-1 truncate">{el.text?.trim() || el.type}</span>
                <b className="tabular-nums">{n}</b>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Private mode ────────────────────────────────────────────────────────────

export function PrivateModeButton({ mode, canEdit, me, onChange }: {
  mode: PrivateMode; canEdit: boolean; me: string; onChange: (m: PrivateMode) => void;
}) {
  const on = !!mode?.on;
  if (!canEdit && !on) return null;
  return (
    <button
      className={`btn-ghost p-1.5 ${on ? "bg-violet-100 text-violet-700" : ""}`}
      title={on ? "Private mode is on: notes stay hidden from others until it's turned off" : "Private mode: hide everyone's new notes until you reveal them"}
      disabled={!canEdit}
      onClick={() => onChange(on ? null : { on: true, by: me })}
    >
      {on ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}

// ── Reactions ───────────────────────────────────────────────────────────────

export const REACTIONS = ["👍", "❤️", "😂", "🎉", "🤔", "👏", "🔥", "➕"];

export type FloatingReaction = { key: string; emoji: string; x: number; y: number; color: string };

export function ReactionPicker({ onReact }: { onReact: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="btn-ghost p-1.5 text-base leading-none" title="React" onClick={() => setOpen((o) => !o)}>🙂</button>
      {open && (
        <div className="card absolute right-0 top-10 z-30 flex gap-1 p-1.5" onMouseLeave={() => setOpen(false)}>
          {REACTIONS.map((e) => (
            <button key={e} className="rounded-md p-1 text-xl hover:bg-slate-100" onClick={() => onReact(e)}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}
