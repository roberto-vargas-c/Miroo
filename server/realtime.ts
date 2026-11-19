/**
 * Realtime collaboration server.
 *
 * Speaks the standard y-websocket protocol (sync + awareness) so the browser can use
 * y-websocket's WebsocketProvider. Each board is a "room" holding one Y.Doc, loaded from and
 * saved back to Postgres. Clients authenticate with a short-lived token minted by the web app
 * (/api/boards/:id/realtime-token), which also says whether the client may edit.
 */
import "dotenv/config";
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { PrismaClient } from "@prisma/client";
import { verifyRealtime, type RealtimeClaims } from "../src/lib/token";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SAVE_DEBOUNCE_MS = 1500;
/** Keep an automatic version at most this often while a board is being edited. */
const VERSION_EVERY_MS = 10 * 60 * 1000;
const MAX_AUTO_VERSIONS = 200;

const prisma = new PrismaClient();

type Conn = { ws: WebSocket; claims: RealtimeClaims; awarenessIds: Set<number> };

class Room {
  doc = new Y.Doc();
  awareness = new awarenessProtocol.Awareness(this.doc);
  conns = new Map<WebSocket, Conn>();
  saveTimer: NodeJS.Timeout | null = null;
  dirty = false;
  lastVersionAt = 0;

  constructor(public boardId: string) {
    this.awareness.setLocalState(null);
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      this.dirty = true;
      this.scheduleSave();
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      this.broadcast(encoding.toUint8Array(enc), origin as WebSocket | undefined);
    });
    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = added.concat(updated, removed);
      const conn = this.conns.get(origin as WebSocket);
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
    const board = await prisma.board.findUnique({ where: { id: this.boardId }, select: { content: true } });
    if (board?.content) Y.applyUpdate(this.doc, new Uint8Array(board.content), "load");
    const last = await prisma.boardVersion.findFirst({ where: { boardId: this.boardId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    this.lastVersionAt = last?.createdAt.getTime() ?? 0;
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
    const state = Buffer.from(Y.encodeStateAsUpdate(this.doc));
    try {
      await prisma.board.update({ where: { id: this.boardId }, data: { content: state } });
      if (Date.now() - this.lastVersionAt >= VERSION_EVERY_MS) await this.snapshot(state);
    } catch (e) {
      console.error(`[realtime] failed to save board ${this.boardId}`, e);
      this.dirty = true;
    }
  }

  /** Automatic version history: one snapshot per VERSION_EVERY_MS of editing, oldest pruned. */
  async snapshot(state: Buffer) {
    this.lastVersionAt = Date.now();
    await prisma.boardVersion.create({
      data: { boardId: this.boardId, content: new Uint8Array(state), auto: true, elementCount: this.doc.getMap("elements").size },
    });
    const stale = await prisma.boardVersion.findMany({
      where: { boardId: this.boardId, auto: true }, orderBy: { createdAt: "desc" }, skip: MAX_AUTO_VERSIONS, select: { id: true },
    });
    if (stale.length) await prisma.boardVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
  }

  broadcast(msg: Uint8Array, except?: WebSocket) {
    for (const ws of this.conns.keys()) {
      if (ws !== except && ws.readyState === ws.OPEN) ws.send(msg);
    }
  }
}

const rooms = new Map<string, Promise<Room>>();

function getRoom(boardId: string) {
  let p = rooms.get(boardId);
  if (!p) {
    p = (async () => {
      const r = new Room(boardId);
      await r.load();
      return r;
    })();
    rooms.set(boardId, p);
  }
  return p;
}

function handleMessage(room: Room, conn: Conn, data: Uint8Array) {
  const decoder = decoding.createDecoder(data);
  const type = decoding.readVarUint(decoder);
  if (type === MSG_SYNC) {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    const syncType = decoding.readVarUint(decoder);
    if (syncType === syncProtocol.messageYjsSyncStep1) {
      syncProtocol.readSyncStep1(decoder, enc, room.doc);
    } else if (conn.claims.canEdit) {
      // Step 2 and incremental updates both carry document changes.
      if (syncType === syncProtocol.messageYjsSyncStep2) syncProtocol.readSyncStep2(decoder, room.doc, conn.ws);
      else if (syncType === syncProtocol.messageYjsUpdate) syncProtocol.readUpdate(decoder, room.doc, conn.ws);
    }
    // Read-only clients' document changes are dropped silently.
    if (encoding.length(enc) > 1) conn.ws.send(encoding.toUint8Array(enc));
  } else if (type === MSG_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn.ws);
  }
}

async function onConnection(ws: WebSocket, req: http.IncomingMessage) {
  // Buffer messages that arrive while we verify the token and load the room; the client sends
  // its first sync message immediately on open, so attaching the listener later would drop it.
  const pending: Uint8Array[] = [];
  const early = (d: Buffer) => pending.push(new Uint8Array(d));
  ws.on("message", early);

  const url = new URL(req.url ?? "/", "http://localhost");
  const boardId = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  const claims = await verifyRealtime(url.searchParams.get("token") ?? "");
  if (!claims || claims.boardId !== boardId) {
    ws.close(4401, "unauthorized");
    return;
  }

  const room = await getRoom(boardId);
  const conn: Conn = { ws, claims, awarenessIds: new Set() };
  room.conns.set(ws, conn);
  ws.off("message", early);
  ws.binaryType = "arraybuffer";
  ws.on("message", (d: ArrayBuffer | Buffer) => {
    try {
      handleMessage(room, conn, new Uint8Array(d as ArrayBuffer));
    } catch (e) {
      console.error("[realtime] bad message", e);
    }
  });

  // Greet: send our state vector (sync step 1) and current awareness.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  ws.send(encoding.toUint8Array(enc));
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const aw = encoding.createEncoder();
    encoding.writeVarUint(aw, MSG_AWARENESS);
    encoding.writeVarUint8Array(aw, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
    ws.send(encoding.toUint8Array(aw));
  }
  for (const m of pending) handleMessage(room, conn, m);

  // Keep-alive.
  let alive = true;
  ws.on("pong", () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 30000);

  ws.on("close", async () => {
    clearInterval(ping);
    room.conns.delete(ws);
    awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(conn.awarenessIds), null);
    if (room.conns.size === 0) {
      await room.save();
      if (room.conns.size === 0) {
        rooms.delete(boardId);
        room.awareness.destroy();
        room.doc.destroy();
      }
    }
  });
}

const port = Number(process.env.REALTIME_PORT ?? process.env.PORT ?? 1234);
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("realtime ok");
});
const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => void onConnection(ws, req));
server.listen(port, () => console.log(`[realtime] listening on :${port}`));

async function shutdown() {
  for (const p of rooms.values()) await (await p).save();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
