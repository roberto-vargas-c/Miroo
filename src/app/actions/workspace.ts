"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { WorkspaceRole, TeamRole, BoardVisibility, LinkAccess } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { atLeast, boardAccessForUser, ROLE_RANK, workspaceRole } from "@/lib/permissions";
import { initialBoardState } from "@/lib/board/doc";
import { TEMPLATES, type TemplateId } from "@/lib/board/templates";

export type ActionResult = { error?: string; ok?: boolean; link?: string } | undefined;

async function requireRole(workspaceId: string, min: WorkspaceRole) {
  const user = await requireUser();
  const role = await workspaceRole(user.id, workspaceId);
  if (!atLeast(role, min)) throw new Error("You don't have permission to do that");
  return { user, role: role! };
}

const token = () => randomBytes(18).toString("base64url");
const name = z.string().trim().min(1, "Name is required").max(100);

// ── Workspaces ──────────────────────────────────────────────────────────────

export async function createWorkspace(form: FormData) {
  const user = await requireUser();
  const n = name.parse(form.get("name"));
  const ws = await db.workspace.create({ data: { name: n, members: { create: { userId: user.id, role: "OWNER" } } } });
  redirect(`/w/${ws.id}`);
}

export async function renameWorkspace(workspaceId: string, form: FormData) {
  await requireRole(workspaceId, "ADMIN");
  await db.workspace.update({ where: { id: workspaceId }, data: { name: name.parse(form.get("name")) } });
  revalidatePath(`/w/${workspaceId}`, "layout");
}

export async function deleteWorkspace(workspaceId: string) {
  await requireRole(workspaceId, "OWNER");
  await db.workspace.delete({ where: { id: workspaceId } });
  redirect("/w");
}

// ── Members & invites ───────────────────────────────────────────────────────

export async function inviteMember(workspaceId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const { user, role } = await requireRole(workspaceId, "ADMIN");
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
  const newRole = z.nativeEnum(WorkspaceRole).parse(form.get("role") ?? "MEMBER");
  if (ROLE_RANK[newRole] > ROLE_RANK[role]) return { error: "You can't invite someone with a higher role than yours" };
  const existing = await db.workspaceMember.findFirst({ where: { workspaceId, user: { email: email.data } } });
  if (existing) return { error: "That person is already a member" };
  const inv = await db.invite.create({
    data: {
      workspaceId,
      email: email.data,
      role: newRole,
      token: token(),
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
  });
  revalidatePath(`/w/${workspaceId}/members`);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return { ok: true, link: `${base}/invite/${inv.token}` };
}

export async function revokeInvite(inviteId: string) {
  const inv = await db.invite.findUniqueOrThrow({ where: { id: inviteId } });
  await requireRole(inv.workspaceId, "ADMIN");
  await db.invite.delete({ where: { id: inviteId } });
  revalidatePath(`/w/${inv.workspaceId}/members`);
}

export async function acceptInvite(inviteToken: string) {
  const user = await requireUser(`/invite/${inviteToken}`);
  const inv = await db.invite.findUnique({ where: { token: inviteToken } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new Error("This invite is no longer valid");
  await db.$transaction([
    db.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } },
      create: { workspaceId: inv.workspaceId, userId: user.id, role: inv.role },
      update: {},
    }),
    db.invite.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
  ]);
  redirect(`/w/${inv.workspaceId}`);
}

export async function changeMemberRole(memberId: string, form: FormData) {
  const m = await db.workspaceMember.findUniqueOrThrow({ where: { id: memberId } });
  const { role } = await requireRole(m.workspaceId, "ADMIN");
  const newRole = z.nativeEnum(WorkspaceRole).parse(form.get("role"));
  if ((m.role === "OWNER" || newRole === "OWNER") && role !== "OWNER") throw new Error("Only owners can change ownership");
  if (m.role === "OWNER" && newRole !== "OWNER") {
    const owners = await db.workspaceMember.count({ where: { workspaceId: m.workspaceId, role: "OWNER" } });
    if (owners <= 1) throw new Error("A workspace needs at least one owner");
  }
  await db.workspaceMember.update({ where: { id: memberId }, data: { role: newRole } });
  revalidatePath(`/w/${m.workspaceId}/members`);
}

export async function removeMember(memberId: string) {
  const user = await requireUser();
  const m = await db.workspaceMember.findUniqueOrThrow({ where: { id: memberId } });
  const self = m.userId === user.id;
  const myRole = await workspaceRole(user.id, m.workspaceId);
  if (!self && !atLeast(myRole, "ADMIN")) throw new Error("You don't have permission to do that");
  if (m.role === "OWNER") {
    if (!self && myRole !== "OWNER") throw new Error("Only owners can remove owners");
    const owners = await db.workspaceMember.count({ where: { workspaceId: m.workspaceId, role: "OWNER" } });
    if (owners <= 1) throw new Error("A workspace needs at least one owner");
  }
  await db.$transaction([
    db.teamMember.deleteMany({ where: { userId: m.userId, team: { workspaceId: m.workspaceId } } }),
    db.workspaceMember.delete({ where: { id: memberId } }),
  ]);
  if (self) redirect("/w");
  revalidatePath(`/w/${m.workspaceId}/members`);
}

// ── Teams ───────────────────────────────────────────────────────────────────

export async function createTeam(workspaceId: string, form: FormData) {
  const { user } = await requireRole(workspaceId, "ADMIN");
  await db.team.create({
    data: {
      workspaceId,
      name: name.parse(form.get("name")),
      description: String(form.get("description") ?? "").slice(0, 300),
      members: { create: { userId: user.id, role: "LEAD" } },
    },
  });
  revalidatePath(`/w/${workspaceId}/teams`);
}

async function requireTeamManager(teamId: string) {
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId } });
  const user = await requireUser();
  const role = await workspaceRole(user.id, team.workspaceId);
  if (!atLeast(role, "ADMIN")) {
    const tm = await db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: user.id } } });
    if (tm?.role !== "LEAD") throw new Error("Only team leads and workspace admins can manage this team");
  }
  return team;
}

export async function deleteTeam(teamId: string) {
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId } });
  await requireRole(team.workspaceId, "ADMIN");
  await db.team.delete({ where: { id: teamId } });
  revalidatePath(`/w/${team.workspaceId}/teams`);
}

export async function addTeamMember(teamId: string, form: FormData) {
  const team = await requireTeamManager(teamId);
  const userId = String(form.get("userId"));
  if (!(await workspaceRole(userId, team.workspaceId))) throw new Error("Not a workspace member");
  const role = z.nativeEnum(TeamRole).parse(form.get("role") ?? "MEMBER");
  await db.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, role },
    update: { role },
  });
  revalidatePath(`/w/${team.workspaceId}/teams`);
}

export async function removeTeamMember(teamMemberId: string) {
  const tm = await db.teamMember.findUniqueOrThrow({ where: { id: teamMemberId } });
  const team = await requireTeamManager(tm.teamId);
  await db.teamMember.delete({ where: { id: teamMemberId } });
  revalidatePath(`/w/${team.workspaceId}/teams`);
}

// ── Boards ──────────────────────────────────────────────────────────────────

export async function createBoard(workspaceId: string, form: FormData) {
  const { user } = await requireRole(workspaceId, "MEMBER");
  const template = (String(form.get("template") ?? "blank") as TemplateId);
  if (!TEMPLATES.some((t) => t.id === template)) throw new Error("Unknown template");
  const teamId = String(form.get("teamId") ?? "") || null;
  if (teamId) {
    const team = await db.team.findFirst({ where: { id: teamId, workspaceId } });
    if (!team) throw new Error("Unknown team");
  }
  const title = String(form.get("title") ?? "").trim() || TEMPLATES.find((t) => t.id === template)!.name;
  const board = await db.board.create({
    data: {
      workspaceId,
      teamId,
      title: title.slice(0, 120),
      createdById: user.id,
      visibility: teamId ? "TEAM" : "WORKSPACE",
      shareToken: token(),
      content: Buffer.from(initialBoardState(template)),
    },
  });
  redirect(`/board/${board.id}`);
}

async function requireBoardManager(boardId: string) {
  const user = await requireUser();
  const board = await db.board.findUniqueOrThrow({ where: { id: boardId } });
  const access = await boardAccessForUser(user.id, board);
  if (!access.canManage) throw new Error("Only the board owner or a workspace admin can do that");
  return { user, board };
}

export async function renameBoard(boardId: string, title: string) {
  const user = await requireUser();
  const board = await db.board.findUniqueOrThrow({ where: { id: boardId } });
  if (!(await boardAccessForUser(user.id, board)).canEdit) throw new Error("No edit access");
  await db.board.update({ where: { id: boardId }, data: { title: name.parse(title) } });
  revalidatePath(`/w/${board.workspaceId}`);
}

export async function deleteBoard(boardId: string) {
  const { board } = await requireBoardManager(boardId);
  await db.board.delete({ where: { id: boardId } });
  revalidatePath(`/w/${board.workspaceId}`);
}

export async function toggleStar(boardId: string) {
  const user = await requireUser();
  const key = { userId_boardId: { userId: user.id, boardId } };
  const existing = await db.boardStar.findUnique({ where: key });
  if (existing) await db.boardStar.delete({ where: key });
  else await db.boardStar.create({ data: { userId: user.id, boardId } });
  const b = await db.board.findUnique({ where: { id: boardId }, select: { workspaceId: true } });
  if (b) revalidatePath(`/w/${b.workspaceId}`);
}

export async function updateBoardSharing(
  boardId: string,
  data: { linkAccess?: LinkAccess; visibility?: BoardVisibility; teamId?: string | null; resetLink?: boolean },
) {
  const { board } = await requireBoardManager(boardId);
  if (data.teamId) {
    const team = await db.team.findFirst({ where: { id: data.teamId, workspaceId: board.workspaceId } });
    if (!team) throw new Error("Unknown team");
  }
  const updated = await db.board.update({
    where: { id: boardId },
    data: {
      linkAccess: data.linkAccess ? z.nativeEnum(LinkAccess).parse(data.linkAccess) : undefined,
      visibility: data.visibility ? z.nativeEnum(BoardVisibility).parse(data.visibility) : undefined,
      teamId: data.teamId === undefined ? undefined : data.teamId,
      shareToken: data.resetLink ? token() : undefined,
    },
    select: { linkAccess: true, visibility: true, teamId: true, shareToken: true },
  });
  return updated;
}
