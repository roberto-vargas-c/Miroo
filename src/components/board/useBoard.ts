"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { BoardElement } from "@/lib/board/types";
import type { BoardScale, Unit } from "@/lib/board/arch";

export type Viewport = { cx: number; cy: number; scale: number };

export type Peer = {
  clientId: number;
  userId?: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
  selection?: string[];
  viewport?: Viewport;
  reaction?: { emoji: string; x: number; y: number; t: number } | null;
  summon?: { t: number; viewport: Viewport } | null;
  presenting?: boolean;
};

/** Shared, board-wide facilitation state kept in the Y.Doc "session" map. */
export type TimerState = { running: boolean; endsAt: number; remainingMs: number; durationMs: number; by: string } | null;
export type VoteSession = { id: string; title: string; votesPerUser: number; open: boolean; anonymous: boolean; by: string; startedAt: number } | null;
export type PrivateMode = { on: boolean; by: string } | null;
export type SessionState = { timer: TimerState; vote: VoteSession; privateMode: PrivateMode; boardScale: BoardScale; unit: Unit | null };

export type ConnStatus = "connecting" | "connected" | "disconnected" | "denied";

export function useBoard(boardId: string, shareToken: string | null, realtimeUrl: string) {
  const doc = useMemo(() => new Y.Doc(), [boardId]);
  const map = useMemo(() => doc.getMap<BoardElement>("elements"), [doc]);
  const undo = useMemo(() => new Y.UndoManager(map, { captureTimeout: 400 }), [map]);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [synced, setSynced] = useState(false);
  const [me, setMe] = useState<{ id: string; name: string; color: string; canEdit: boolean } | null>(null);
  const sessionMap = useMemo(() => doc.getMap<unknown>("session"), [doc]);
  // votes: key "<voteId>|<userId>" -> element ids that user voted for
  const votesMap = useMemo(() => doc.getMap<string[]>("votes"), [doc]);
  const [session, setSession] = useState<SessionState>({ timer: null, vote: null, privateMode: null, boardScale: null, unit: null });
  const [votes, setVotes] = useState<Map<string, string[]>>(new Map());
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    const update = () => setElements(Array.from(map.values()).sort((a, b) => a.z - b.z));
    map.observe(update);
    update();
    return () => map.unobserve(update);
  }, [map]);

  useEffect(() => {
    const upd = () => setSession({
      timer: (sessionMap.get("timer") as TimerState) ?? null,
      vote: (sessionMap.get("vote") as VoteSession) ?? null,
      privateMode: (sessionMap.get("privateMode") as PrivateMode) ?? null,
      boardScale: (sessionMap.get("boardScale") as BoardScale) ?? null,
      unit: (sessionMap.get("unit") as Unit) ?? null,
    });
    const updVotes = () => setVotes(new Map(votesMap.entries()));
    sessionMap.observe(upd);
    votesMap.observe(updVotes);
    upd(); updVotes();
    return () => { sessionMap.unobserve(upd); votesMap.unobserve(updVotes); };
  }, [sessionMap, votesMap]);

  useEffect(() => {
    let cancelled = false;
    let provider: WebsocketProvider | null = null;
    (async () => {
      const q = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
      const res = await fetch(`/api/boards/${boardId}/realtime-token${q}`);
      if (!res.ok) { setStatus("denied"); return; }
      const { token, id, name, color, canEdit } = await res.json();
      if (cancelled) return;
      setMe({ id, name, color, canEdit });
      // A path like "/realtime" means the same host as the page (Cloudflare deploys).
      const wsUrl = realtimeUrl.startsWith("/") ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${realtimeUrl}` : realtimeUrl;
      provider = new WebsocketProvider(wsUrl, boardId, doc, { params: { token } });
      providerRef.current = provider;
      provider.awareness.setLocalStateField("user", { id, name, color });
      provider.on("status", ({ status }: { status: string }) => setStatus(status as ConnStatus));
      provider.on("sync", (s: boolean) => s && setSynced(true));
      provider.on("connection-close", (ev: CloseEvent | null) => {
        if (ev?.code === 4401) { provider?.disconnect(); setStatus("denied"); }
      });
      const aw = provider.awareness;
      const onAw = () => {
        const list: Peer[] = [];
        aw.getStates().forEach((s, clientId) => {
          if (clientId === doc.clientID || !s.user) return;
          list.push({
            clientId, userId: s.user.id, name: s.user.name, color: s.user.color, cursor: s.cursor, selection: s.selection,
            viewport: s.viewport, reaction: s.reaction, summon: s.summon, presenting: s.presenting,
          });
        });
        setPeers(list);
      };
      aw.on("change", onAw);
    })();
    return () => {
      cancelled = true;
      provider?.awareness.setLocalState(null);
      provider?.destroy();
      providerRef.current = null;
    };
  }, [boardId, shareToken, realtimeUrl, doc]);

  useEffect(() => () => { undo.destroy(); doc.destroy(); }, [doc, undo]);

  const api = useMemo(() => {
    const transact = (fn: () => void) => doc.transact(fn);
    return {
      add(els: BoardElement[]) { transact(() => els.forEach((e) => map.set(e.id, e))); },
      update(id: string, patch: Partial<BoardElement>) {
        const cur = map.get(id);
        if (cur) map.set(id, { ...cur, ...patch } as BoardElement);
      },
      updateMany(patches: { id: string; patch: Partial<BoardElement> }[]) {
        transact(() => patches.forEach(({ id, patch }) => {
          const cur = map.get(id);
          if (cur) map.set(id, { ...cur, ...patch } as BoardElement);
        }));
      },
      remove(ids: string[]) {
        transact(() => {
          const set = new Set(ids);
          ids.forEach((id) => map.delete(id));
          // Detach connectors from deleted elements rather than leaving dangling references.
          map.forEach((el) => {
            if (el.type !== "connector") return;
            const c = el as import("@/lib/board/types").ConnectorElement;
            if ((c.from.id && set.has(c.from.id)) || (c.to.id && set.has(c.to.id))) map.delete(c.id);
          });
        });
      },
      /** Replace every element at once (restoring a version). Undoable like any other edit. */
      replaceAll(els: BoardElement[]) {
        transact(() => {
          const keep = new Set(els.map((e) => e.id));
          Array.from(map.keys()).forEach((id) => { if (!keep.has(id)) map.delete(id); });
          els.forEach((e) => {
            const cur = map.get(e.id);
            if (!cur || JSON.stringify(cur) !== JSON.stringify(e)) map.set(e.id, e);
          });
        });
      },
      /** The whole document, encoded, e.g. to save a named version. */
      encodeState: () => Y.encodeStateAsUpdate(doc),
      get: (id: string) => map.get(id),
      undo: () => undo.undo(),
      redo: () => undo.redo(),
      setCursor(p: { x: number; y: number } | null) { providerRef.current?.awareness.setLocalStateField("cursor", p); },
      setSelection(ids: string[]) { providerRef.current?.awareness.setLocalStateField("selection", ids); },
      setPresence(field: "viewport" | "reaction" | "summon" | "presenting", value: unknown) {
        providerRef.current?.awareness.setLocalStateField(field, value);
      },
      setSession<K extends keyof SessionState>(key: K, value: SessionState[K]) {
        if (value === null) sessionMap.delete(key); else sessionMap.set(key, value);
      },
      setVotes(key: string, ids: string[]) { votesMap.set(key, ids); },
      clearVotes(voteId: string) {
        transact(() => Array.from(votesMap.keys()).filter((k) => k.startsWith(`${voteId}|`)).forEach((k) => votesMap.delete(k)));
      },
    };
  }, [doc, map, undo, sessionMap, votesMap]);

  return { elements, peers, status, synced, me, api, session, votes };
}

export type BoardApi = ReturnType<typeof useBoard>["api"];
