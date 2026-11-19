"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { BoardElement } from "@/lib/board/types";

export type Peer = {
  clientId: number;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
  selection?: string[];
};

export type ConnStatus = "connecting" | "connected" | "disconnected" | "denied";

export function useBoard(boardId: string, shareToken: string | null, realtimeUrl: string) {
  const doc = useMemo(() => new Y.Doc(), [boardId]);
  const map = useMemo(() => doc.getMap<BoardElement>("elements"), [doc]);
  const undo = useMemo(() => new Y.UndoManager(map, { captureTimeout: 400 }), [map]);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [synced, setSynced] = useState(false);
  const [me, setMe] = useState<{ name: string; color: string; canEdit: boolean } | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    const update = () => setElements(Array.from(map.values()).sort((a, b) => a.z - b.z));
    map.observe(update);
    update();
    return () => map.unobserve(update);
  }, [map]);

  useEffect(() => {
    let cancelled = false;
    let provider: WebsocketProvider | null = null;
    (async () => {
      const q = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
      const res = await fetch(`/api/boards/${boardId}/realtime-token${q}`);
      if (!res.ok) { setStatus("denied"); return; }
      const { token, name, color, canEdit } = await res.json();
      if (cancelled) return;
      setMe({ name, color, canEdit });
      provider = new WebsocketProvider(realtimeUrl, boardId, doc, { params: { token } });
      providerRef.current = provider;
      provider.awareness.setLocalStateField("user", { name, color });
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
          list.push({ clientId, name: s.user.name, color: s.user.color, cursor: s.cursor, selection: s.selection });
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
      get: (id: string) => map.get(id),
      undo: () => undo.undo(),
      redo: () => undo.redo(),
      setCursor(p: { x: number; y: number } | null) { providerRef.current?.awareness.setLocalStateField("cursor", p); },
      setSelection(ids: string[]) { providerRef.current?.awareness.setLocalStateField("selection", ids); },
    };
  }, [doc, map, undo]);

  return { elements, peers, status, synced, me, api };
}

export type BoardApi = ReturnType<typeof useBoard>["api"];
