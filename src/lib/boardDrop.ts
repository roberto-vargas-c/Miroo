import "server-only";
import * as Y from "yjs";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db } from "./db";
import { INTERNAL_HEADER, internalKey } from "./token";
import { dropElements } from "./board/drop";
import type { BoardElement } from "./board/types";

type Area = { x: number; y: number; width: number; height: number };
type RoomNamespace = { idFromName(n: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } };

const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * Puts elements (laid out from 0, 0) on a board, next to what is already there, through the board's live room, so
 * everyone who has it open sees them come in and nobody's open board overwrites them. On Cloudflare that is the board's
 * Durable Object; on Node the realtime server (REALTIME_INTERNAL_URL, default http://localhost:REALTIME_PORT), or the
 * saved board when that server can't be reached.
 */
export async function dropOnBoard(boardId: string, elements: BoardElement[]): Promise<Area> {
  const init = { method: "POST", headers: { "content-type": "application/json", [INTERNAL_HEADER]: await internalKey() }, body: JSON.stringify({ elements }) };
  if (onWorkers) {
    const ns = (getCloudflareContext().env as { BOARD_ROOM?: RoomNamespace }).BOARD_ROOM;
    if (!ns) throw new Error("BOARD_ROOM is not bound");
    const res = await ns.get(ns.idFromName(boardId)).fetch(new Request(`https://room/drop/${encodeURIComponent(boardId)}`, init));
    if (!res.ok) throw new Error(`The board's room answered ${res.status}`);
    return (await res.json()) as Area;
  }
  const base = (process.env.REALTIME_INTERNAL_URL ?? `http://localhost:${process.env.REALTIME_PORT ?? 1234}`).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/drop/${encodeURIComponent(boardId)}`, { ...init, signal: AbortSignal.timeout(10000) });
    if (res.ok) return (await res.json()) as Area;
    if (res.status === 403) throw new Error("The realtime server has another AUTH_SECRET");
  } catch (e) {
    if (e instanceof Error && e.message.includes("AUTH_SECRET")) throw e;
    // the realtime server isn't running: write the saved board instead
  }
  const board = await db.board.findUnique({ where: { id: boardId }, select: { content: true } });
  const doc = new Y.Doc();
  if (board?.content) Y.applyUpdate(doc, new Uint8Array(board.content));
  const area = dropElements(doc, elements);
  await db.board.update({ where: { id: boardId }, data: { content: Buffer.from(Y.encodeStateAsUpdate(doc)) } });
  doc.destroy();
  return area;
}
