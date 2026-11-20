/**
 * One board's live session: a Y.Doc plus who is connected, speaking the standard y-websocket
 * protocol (sync + awareness). Transport-neutral, so the same code runs in the Node realtime server
 * (local and classic hosting) and in a Cloudflare Durable Object.
 */
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { RealtimeClaims } from "../src/lib/token";
import type { BoardElement } from "../src/lib/board/types";
import { dropElements } from "../src/lib/board/drop";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SAVE_DEBOUNCE_MS = 1500;
/** Keep an automatic version at most this often while a board is being edited. */
const VERSION_EVERY_MS = 10 * 60 * 1000;
export const MAX_AUTO_VERSIONS = 200;

/** A connected client, whatever the socket type. */
export type Peer = { send(data: Uint8Array): void; isOpen(): boolean };

/** Where board content lives (Postgres in both deployments). */
export type RoomStore = {
  load(boardId: string): Promise<{ content: Uint8Array | null; lastVersionAt: number }>;
  save(boardId: string, content: Uint8Array): Promise<void>;
  snapshot(boardId: string, content: Uint8Array, elementCount: number): Promise<void>;
};

type Conn = { peer: Peer; claims: RealtimeClaims; awarenessIds: Set<number> };

export class Room {
  doc = new Y.Doc();
  awareness = new awarenessProtocol.Awareness(this.doc);
  conns = new Map<Peer, Conn>();
  saveTimer: ReturnType<typeof setTimeout> | null = null;
  dirty = false;
  lastVersionAt = 0;

  constructor(public boardId: string, private store: RoomStore) {
    this.awareness.setLocalState(null);
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      this.dirty = true;
      this.scheduleSave();
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      this.broadcast(encoding.toUint8Array(enc), origin as Peer | undefined);
    });
    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = added.concat(updated, removed);
      const conn = this.conns.get(origin as Peer);
      if (conn) {
        added.forEach((id) => conn.awarenessIds.add(id));
        removed.forEach((id) => conn.awarenessIds.delete(id));
      }
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
      this.broadcast(encoding.toUint8Array(enc));
    });
  }

  async load() {
    const { content, lastVersionAt } = await this.store.load(this.boardId);
    if (content) Y.applyUpdate(this.doc, content, "load");
    this.lastVersionAt = lastVersionAt;
    this.dirty = false;
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), SAVE_DEBOUNCE_MS);
  }

  async save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.dirty) return;
    this.dirty = false;
    const state = Y.encodeStateAsUpdate(this.doc);
    try {
      await this.store.save(this.boardId, state);
      // Automatic version history: one snapshot per VERSION_EVERY_MS of editing.
      if (Date.now() - this.lastVersionAt >= VERSION_EVERY_MS) {
        this.lastVersionAt = Date.now();
        await this.store.snapshot(this.boardId, state, this.doc.getMap("elements").size);
      }
    } catch (e) {
      console.error(`[realtime] failed to save board ${this.boardId}`, e);
      this.dirty = true;
    }
  }

  /** Elements another app sends in (laid out from 0, 0): placed next to the board's contents and saved at once. */
  async drop(elements: BoardElement[]) {
    const area = dropElements(this.doc, elements);
    await this.save();
    return area;
  }

  /** Add a client: greet it with our state vector and the current awareness, then replay what it already sent. */
  join(peer: Peer, claims: RealtimeClaims, pending: Uint8Array[] = []) {
    const conn: Conn = { peer, claims, awarenessIds: new Set() };
    this.conns.set(peer, conn);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, this.doc);
    peer.send(encoding.toUint8Array(enc));
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const aw = encoding.createEncoder();
      encoding.writeVarUint(aw, MSG_AWARENESS);
      encoding.writeVarUint8Array(aw, awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys())));
      peer.send(encoding.toUint8Array(aw));
    }
    for (const m of pending) this.receive(peer, m);
  }

  receive(peer: Peer, data: Uint8Array) {
    const conn = this.conns.get(peer);
    if (!conn) return;
    try {
      const decoder = decoding.createDecoder(data);
      const type = decoding.readVarUint(decoder);
      if (type === MSG_SYNC) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        const syncType = decoding.readVarUint(decoder);
        if (syncType === syncProtocol.messageYjsSyncStep1) {
          syncProtocol.readSyncStep1(decoder, enc, this.doc);
        } else if (conn.claims.canEdit) {
          // Step 2 and incremental updates both carry document changes.
          if (syncType === syncProtocol.messageYjsSyncStep2) syncProtocol.readSyncStep2(decoder, this.doc, peer);
          else if (syncType === syncProtocol.messageYjsUpdate) syncProtocol.readUpdate(decoder, this.doc, peer);
        }
        // Read-only clients' document changes are dropped silently.
        if (encoding.length(enc) > 1) peer.send(encoding.toUint8Array(enc));
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), peer);
      }
    } catch (e) {
      console.error("[realtime] bad message", e);
    }
  }

  /** Remove a client. Resolves true when the room is now empty and saved. */
  async leave(peer: Peer) {
    const conn = this.conns.get(peer);
    if (!conn) return false;
    this.conns.delete(peer);
    awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(conn.awarenessIds), null);
    if (this.conns.size > 0) return false;
    await this.save();
    return this.conns.size === 0;
  }

  destroy() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.awareness.destroy();
    this.doc.destroy();
  }

  broadcast(msg: Uint8Array, except?: Peer) {
    for (const peer of this.conns.keys()) if (peer !== except && peer.isOpen()) peer.send(msg);
  }
}

/** The Postgres-backed store, given a Prisma client factory (one per operation on Workers). */
export function prismaStore(withDb: <T>(fn: (db: import("@prisma/client").PrismaClient) => Promise<T>) => Promise<T>): RoomStore {
  return {
    load: (boardId) => withDb(async (db) => {
      const board = await db.board.findUnique({ where: { id: boardId }, select: { content: true } });
      const last = await db.boardVersion.findFirst({ where: { boardId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      return { content: board?.content ? new Uint8Array(board.content) : null, lastVersionAt: last?.createdAt.getTime() ?? 0 };
    }),
    save: (boardId, content) => withDb(async (db) => {
      await db.board.update({ where: { id: boardId }, data: { content: new Uint8Array(content) } });
    }),
    snapshot: (boardId, content, elementCount) => withDb(async (db) => {
      await db.boardVersion.create({ data: { boardId, content: new Uint8Array(content), auto: true, elementCount } });
      const stale = await db.boardVersion.findMany({
        where: { boardId, auto: true }, orderBy: { createdAt: "desc" }, skip: MAX_AUTO_VERSIONS, select: { id: true },
      });
      if (stale.length) await db.boardVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
    }),
  };
}
