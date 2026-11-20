import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { appCaller } from "@/lib/apps";
import { atLeast } from "@/lib/permissions";
import { initialBoardState } from "@/lib/board/doc";
import { audit } from "@/lib/audit";
import { APP_URL } from "@/lib/mail";

const unauthorized = () => NextResponse.json({ error: "Connect your Schema account again" }, { status: 401 });

/** For a connected app: the workspaces where the person can make boards, each with the boards they can edit (newest first). */
export async function GET(req: Request) {
  const c = await appCaller(req);
  if (!c) return unauthorized();
  const uid = c.user.id;
  const [memberships, teams] = await Promise.all([
    db.workspaceMember.findMany({ where: { userId: uid }, include: { workspace: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    db.teamMember.findMany({ where: { userId: uid }, select: { teamId: true } }),
  ]);
  const myTeams = new Set(teams.map((t) => t.teamId));
  const editable = memberships.filter((m) => atLeast(m.role, "MEMBER"));
  const boards = await db.board.findMany({
    where: { workspaceId: { in: editable.map((m) => m.workspaceId) } },
    select: { id: true, title: true, workspaceId: true, teamId: true, visibility: true, createdById: true, updatedAt: true },
    orderBy: { updatedAt: "desc" }, take: 500,
  });
  const workspaces = editable.map((m) => {
    const admin = atLeast(m.role, "ADMIN");
    const mine = boards.filter((b) => b.workspaceId === m.workspaceId && (admin || b.createdById === uid || b.visibility === "WORKSPACE"
      || (b.visibility === "TEAM" && !!b.teamId && myTeams.has(b.teamId))));
    return {
      id: m.workspace.id, name: m.workspace.name,
      boards: mine.slice(0, 100).map((b) => ({ id: b.id, title: b.title, url: `${APP_URL()}/board/${b.id}`, updatedAt: b.updatedAt })),
    };
  });
  return NextResponse.json({ user: { name: c.user.name, email: c.user.email }, workspaces }, { headers: { "cache-control": "no-store" } });
}

const Body = z.object({ workspaceId: z.string().min(1).max(60), title: z.string().trim().min(1).max(120) });

/** For a connected app: a new blank board in one of the person's workspaces. */
export async function POST(req: Request) {
  const c = await appCaller(req);
  if (!c) return unauthorized();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { workspaceId, title }" }, { status: 400 });
  const m = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: c.user.id } } });
  if (!m || !atLeast(m.role, "MEMBER")) return NextResponse.json({ error: "You can't make boards in that workspace" }, { status: 403 });
  const board = await db.board.create({
    data: {
      workspaceId: m.workspaceId, title: parsed.data.title, createdById: c.user.id, visibility: "WORKSPACE",
      shareToken: randomBytes(18).toString("base64url"), content: Buffer.from(initialBoardState("blank")),
    },
  });
  await audit(m.workspaceId, c.user, "board.created", { type: "board", id: board.id, name: board.title }, { via: c.app });
  return NextResponse.json({ id: board.id, title: board.title, url: `${APP_URL()}/board/${board.id}` });
}
