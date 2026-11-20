import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { atLeast, workspaceRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { stateFromElements } from "@/lib/board/doc";
import { MiroError, miroBoardAccess } from "@/lib/miroAuth";
import { importMiroBoard, stackImported } from "@/lib/miroImport";

const Body = z.object({
  miroBoardId: z.string().min(3).max(200),
  folderId: z.string().max(40).optional(),
  teamId: z.string().max(40).optional(),
});

/**
 * Copies one Miro board into this workspace as a new Schema board, through the person's connected
 * Miro account. "Migrate from Miro" calls this once per board, so each shows its own progress and a
 * failure skips only that board.
 */
export async function POST(req: Request, { params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!atLeast(await workspaceRole(user.id, wid), "MEMBER")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing the Miro board" }, { status: 400 });
  const { miroBoardId, folderId, teamId } = parsed.data;
  if (folderId && !(await db.folder.findFirst({ where: { id: folderId, workspaceId: wid } }))) return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
  if (teamId && !(await db.team.findFirst({ where: { id: teamId, workspaceId: wid } }))) return NextResponse.json({ error: "Unknown team" }, { status: 400 });

  let boardId: string | null = null;
  try {
    const { token, board: miroBoard } = await miroBoardAccess(user.id, miroBoardId);
    const title = (miroBoard.name || "Miro board").slice(0, 120);
    // The board exists first so imported pictures can be stored with it.
    const board = await db.board.create({
      data: {
        workspaceId: wid, teamId: teamId || null, folderId: folderId || null, title, createdById: user.id,
        visibility: teamId ? "TEAM" : "WORKSPACE", shareToken: randomBytes(18).toString("base64url"),
        content: Buffer.from(stateFromElements([])),
      },
    });
    boardId = board.id;
    const result = await importMiroBoard(token, miroBoardId, board.id);
    await db.board.update({ where: { id: board.id }, data: { content: Buffer.from(stateFromElements(stackImported(result.elements))) } });
    await audit(wid, user, "board.created", { type: "board", id: board.id, name: title }, { importedFrom: "miro" });
    return NextResponse.json({
      boardId: board.id, title, items: result.elements.length, skipped: result.skipped, imageFailures: result.imageFailures, truncated: result.truncated,
    });
  } catch (e) {
    if (boardId) await db.board.delete({ where: { id: boardId } }).catch(() => {});
    if (e instanceof MiroError) return NextResponse.json({ error: e.message, needsConnect: e.needsConnect || undefined }, { status: e.status });
    console.error("[miro] migrate failed", e);
    return NextResponse.json({ error: "Couldn't reach Miro. Try again" }, { status: 502 });
  }
}
