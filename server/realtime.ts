/**
 * Realtime collaboration server for Node (local development and classic hosting).
 * On Cloudflare the same rooms run in a Durable Object instead (server/boardRoom.ts).
 *
 * Clients authenticate with a short-lived token minted by the web app
 * (/api/boards/:id/realtime-token), which also says whether the client may edit.
 */
import "dotenv/config";
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { makePrisma } from "../src/lib/prismaClient";
import { verifyRealtime } from "../src/lib/token";
import { Room, prismaStore, type Peer } from "./room";

const prisma = makePrisma(process.env.DATABASE_URL ?? "");
const store = prismaStore((fn) => fn(prisma));
const rooms = new Map<string, Promise<Room>>();

function getRoom(boardId: string) {
  let p = rooms.get(boardId);
  if (!p) {
    p = (async () => {
      const r = new Room(boardId, store);
      await r.load();
      return r;
    })();
    rooms.set(boardId, p);
  }
  return p;
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
  const peer: Peer = { send: (d) => ws.send(d), isOpen: () => ws.readyState === ws.OPEN };
  ws.off("message", early);
  ws.binaryType = "arraybuffer";
  ws.on("message", (d: ArrayBuffer) => room.receive(peer, new Uint8Array(d)));
  room.join(peer, claims, pending);

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
    if (await room.leave(peer)) {
      rooms.delete(boardId);
      room.destroy();
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
