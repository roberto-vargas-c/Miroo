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
import { INTERNAL_HEADER, internalKey, sameString, verifyRealtime } from "../src/lib/token";
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
/** POST /drop/<boardId> from the web app: elements another app sends in, placed in the live room (or the saved board). */
async function onDrop(req: http.IncomingMessage, res: http.ServerResponse, boardId: string) {
  const reply = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (!sameString(String(req.headers[INTERNAL_HEADER] ?? ""), await internalKey())) return reply(403, { error: "Not allowed" });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > 4 * 1024 * 1024) return reply(413, { error: "Too large" }); chunks.push(c as Buffer); }
  let elements: unknown;
  try { elements = JSON.parse(Buffer.concat(chunks).toString("utf8")).elements; } catch { return reply(400, { error: "Bad request" }); }
  if (!Array.isArray(elements)) return reply(400, { error: "Bad request" });
  const live = rooms.has(boardId);
  const room = await getRoom(boardId);
  const area = await room.drop(elements);
  if (!live && room.conns.size === 0) { rooms.delete(boardId); room.destroy(); }
  reply(200, area);
}

const server = http.createServer((req, res) => {
  const m = req.method === "POST" ? (req.url ?? "").match(/^\/drop\/([^/?#]+)/) : null;
  if (m) {
    onDrop(req, res, decodeURIComponent(m[1])).catch((e) => {
      console.error("[realtime] drop failed", e);
      if (!res.headersSent) { res.writeHead(500); res.end(); }
    });
    return;
  }
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
