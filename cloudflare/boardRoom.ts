/**
 * Live collaboration on Cloudflare: one Durable Object per board holds the Y.Doc and every
 * connected client's socket, so all editors of a board meet in the same place.
 */
import { DurableObject } from "cloudflare:workers";
import { makePrisma } from "../src/lib/prismaClient";
import { verifyRealtime } from "../src/lib/token";
import { Room, prismaStore, type Peer } from "../server/room";

export type Env = {
  BOARD_ROOM: DurableObjectNamespace<BoardRoom>;
  HYPERDRIVE: Hyperdrive;
  AUTH_SECRET: string;
};

export class BoardRoom extends DurableObject<Env> {
  private room: Promise<Room> | null = null;
  private peers = new Map<WebSocket, Peer>();

  private getRoom(boardId: string) {
    this.room ??= (async () => {
      // A fresh database client for each load or save, through Hyperdrive's connection pool.
      const store = prismaStore(async (fn) => {
        const db = makePrisma(this.env.HYPERDRIVE.connectionString);
        try { return await fn(db); } finally { await db.$disconnect(); }
      });
      const r = new Room(boardId, store);
      await r.load();
      return r;
    })();
    this.room.catch(() => { this.room = null; });
    return this.room;
  }

  async fetch(req: Request) {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const url = new URL(req.url);
    const boardId = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    const pair = new WebSocketPair();
    const [client, ws] = [pair[0], pair[1]];
    ws.accept();
    // Newer compatibility dates deliver binary messages as Blobs unless asked otherwise.
    (ws as unknown as { binaryType: string }).binaryType = "arraybuffer";

    // Buffer what arrives while we check the token and load the board (the client speaks first).
    const pending: Uint8Array[] = [];
    let peer: Peer | null = null;
    let room: Room | null = null;
    ws.addEventListener("message", (ev) => {
      const data = typeof ev.data === "string" ? new TextEncoder().encode(ev.data) : new Uint8Array(ev.data);
      if (peer && room) room.receive(peer, data);
      else pending.push(data);
    });
    const close = async () => {
      if (!peer || !room) return;
      const p = peer, r = room;
      peer = null;
      this.peers.delete(ws);
      if (await r.leave(p)) {
        r.destroy();
        this.room = null;
      }
    };
    ws.addEventListener("close", () => void close());
    ws.addEventListener("error", () => void close());

    void (async () => {
      const claims = await verifyRealtime(url.searchParams.get("token") ?? "");
      if (!claims || claims.boardId !== boardId) {
        ws.close(4401, "unauthorized");
        return;
      }
      try {
        room = await this.getRoom(boardId);
      } catch (e) {
        console.error(`[realtime] couldn't load board ${boardId}`, e);
        ws.close(1011, "couldn't load the board");
        return;
      }
      peer = { send: (d) => ws.send(d), isOpen: () => ws.readyState === WebSocket.OPEN };
      this.peers.set(ws, peer);
      room.join(peer, claims, pending);
    })();

    return new Response(null, { status: 101, webSocket: client });
  }
}
