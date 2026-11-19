"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { WorkspaceRole, TeamRole, BoardVisibility, LinkAccess } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { atLeast, boardAccessForUser, ROLE_RANK, workspaceRole } from "@/lib/permissions";
import { initialBoardState, stateFromElements } from "@/lib/board/doc";
import type { BoardElement } from "@/lib/board/types";
import { audit } from "@/lib/audit";
import { sendMail, APP_URL } from "@/lib/mail";
import { PRODUCT_NAME } from "@/lib/brand";
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
  await audit(ws.id, user, "workspace.created", { type: "workspace", id: ws.id, name: n });
  redirect(`/w/${ws.id}`);
}

export async function renameWorkspace(workspaceId: string, form: FormData) {
  const { user } = await requireRole(workspaceId, "ADMIN");
  const before = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } });
  const n = name.parse(form.get("name"));
  await db.workspace.update({ where: { id: workspaceId }, data: { name: n } });
  await audit(workspaceId, user, "workspace.renamed", { type: "workspace", id: workspaceId, name: n }, { from: before.name });
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
  const link = `${APP_URL()}/invite/${inv.token}`;
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } });
  await sendMail({
    to: email.data,
    subject: `${user.name} invited you to ${ws.name} on ${PRODUCT_NAME}`,
    text: `${user.name} invited you to join the “${ws.name}” workspace on ${PRODUCT_NAME} as ${newRole.toLowerCase()}.\n\nAccept the invite:\n${link}\n\nThe link works for 14 days.`,
  });
  await audit(workspaceId, user, "member.invited", { type: "invite", id: inv.id, name: email.data }, { role: newRole });
  return { ok: true, link };
}

export async function revokeInvite(inviteId: string) {
  const inv = await db.invite.findUniqueOrThrow({ where: { id: inviteId } });
  const { user } = await requireRole(inv.workspaceId, "ADMIN");
  await db.invite.delete({ where: { id: inviteId } });
  await audit(inv.workspaceId, user, "invite.revoked", { type: "invite", id: inv.id, name: inv.email });
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
  await audit(inv.workspaceId, user, "member.joined", { type: "user", id: user.id, name: user.name }, { role: inv.role, invite: inv.email });
  redirect(`/w/${inv.workspaceId}`);
}

export async function changeMemberRole(memberId: string, form: FormData) {
  const m = await db.workspaceMember.findUniqueOrThrow({ where: { id: memberId } });
  const { role, user } = await requireRole(m.workspaceId, "ADMIN");
  const newRole = z.nativeEnum(WorkspaceRole).parse(form.get("role"));
  if ((m.role === "OWNER" || newRole === "OWNER") && role !== "OWNER") throw new Error("Only owners can change ownership");
  if (m.role === "OWNER" && newRole !== "OWNER") {
    const owners = await db.workspaceMember.count({ where: { workspaceId: m.workspaceId, role: "OWNER" } });
    if (owners <= 1) throw new Error("A workspace needs at least one owner");
  }
  await db.workspaceMember.update({ where: { id: memberId }, data: { role: newRole } });
  const target = await db.user.findUnique({ where: { id: m.userId }, select: { name: true } });
  await audit(m.workspaceId, user, "member.role_changed", { type: "user", id: m.userId, name: target?.name }, { from: m.role, to: newRole });
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
  const target = self ? user : await db.user.findUnique({ where: { id: m.userId }, select: { name: true } });
  await audit(m.workspaceId, user, "member.removed", { type: "user", id: m.userId, name: target?.name }, { role: m.role, left: self });
  if (self) redirect("/w");
  revalidatePath(`/w/${m.workspaceId}/members`);
}

// ── Teams ───────────────────────────────────────────────────────────────────

export async function createTeam(workspaceId: string, form: FormData) {
  const { user } = await requireRole(workspaceId, "ADMIN");
  const team = await db.team.create({
    data: {
      workspaceId,
      name: name.parse(form.get("name")),
      description: String(form.get("description") ?? "").slice(0, 300),
      members: { create: { userId: user.id, role: "LEAD" } },
    },
  });
  await audit(workspaceId, user, "team.created", { type: "team", id: team.id, name: team.name });
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
  const { user } = await requireRole(team.workspaceId, "ADMIN");
  await db.team.delete({ where: { id: teamId } });
  await audit(team.workspaceId, user, "team.deleted", { type: "team", id: team.id, name: team.name });
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
  const [actor, added] = await Promise.all([requireUser(), db.user.findUnique({ where: { id: userId }, select: { name: true } })]);
  await audit(team.workspaceId, actor, "team.member_added", { type: "team", id: team.id, name: team.name }, { user: added?.name, role });
  revalidatePath(`/w/${team.workspaceId}/teams`);
}

export async function removeTeamMember(teamMemberId: string) {
  const tm = await db.teamMember.findUniqueOrThrow({ where: { id: teamMemberId } });
  const team = await requireTeamManager(tm.teamId);
  await db.teamMember.delete({ where: { id: teamMemberId } });
  const [actor, removed] = await Promise.all([requireUser(), db.user.findUnique({ where: { id: tm.userId }, select: { name: true } })]);
  await audit(team.workspaceId, actor, "team.member_removed", { type: "team", id: team.id, name: team.name }, { user: removed?.name });
  revalidatePath(`/w/${team.workspaceId}/teams`);
}

// ── Boards ──────────────────────────────────────────────────────────────────

export async function createBoard(workspaceId: string, form: FormData) {
  const { user } = await requireRole(workspaceId, "MEMBER");
  const template = String(form.get("template") ?? "blank");
  let content: Uint8Array;
  let defaultTitle: string;
  if (template.startsWith("custom:")) {
    const t = await db.boardTemplate.findFirst({ where: { id: template.slice(7), workspaceId } });
    if (!t) throw new Error("Unknown template");
    content = stateFromElements(t.elements as unknown as BoardElement[]);
    defaultTitle = t.name;
  } else {
    const builtIn = TEMPLATES.find((t) => t.id === template);
    if (!builtIn) throw new Error("Unknown template");
    content = initialBoardState(template as TemplateId);
    defaultTitle = builtIn.name;
  }
  const teamId = String(form.get("teamId") ?? "") || null;
  if (teamId) {
    const team = await db.team.findFirst({ where: { id: teamId, workspaceId } });
    if (!team) throw new Error("Unknown team");
  }
  const folderId = String(form.get("folderId") ?? "") || null;
  if (folderId && !(await db.folder.findFirst({ where: { id: folderId, workspaceId } }))) throw new Error("Unknown folder");
  const title = String(form.get("title") ?? "").trim() || defaultTitle;
  const board = await db.board.create({
    data: {
      workspaceId,
      teamId,
      folderId,
      title: title.slice(0, 120),
      createdById: user.id,
      visibility: teamId ? "TEAM" : "WORKSPACE",
      shareToken: token(),
      content: Buffer.from(content),
    },
  });
  await audit(workspaceId, user, "board.created", { type: "board", id: board.id, name: board.title }, { template, team: teamId, folder: folderId });
  redirect(`/board/${board.id}`);
}

// ── Folders ─────────────────────────────────────────────────────────────────

export async function createFolder(workspaceId: string, form: FormData) {
  const { user } = await requireRole(workspaceId, "MEMBER");
  const f = await db.folder.create({ data: { workspaceId, name: name.parse(form.get("name")) } });
  await audit(workspaceId, user, "folder.created", { type: "folder", id: f.id, name: f.name });
  redirect(`/w/${workspaceId}?folder=${f.id}`);
}

export async function renameFolder(folderId: string, form: FormData) {
  const folder = await db.folder.findUniqueOrThrow({ where: { id: folderId } });
  const { user } = await requireRole(folder.workspaceId, "MEMBER");
  const n = name.parse(form.get("name"));
  await db.folder.update({ where: { id: folderId }, data: { name: n } });
  await audit(folder.workspaceId, user, "folder.renamed", { type: "folder", id: folderId, name: n }, { from: folder.name });
  revalidatePath(`/w/${folder.workspaceId}`);
}

/** Deleting a folder keeps its boards; they move back to "no folder". */
export async function deleteFolder(folderId: string) {
  const folder = await db.folder.findUniqueOrThrow({ where: { id: folderId } });
  const { user } = await requireRole(folder.workspaceId, "ADMIN");
  await db.folder.delete({ where: { id: folderId } });
  await audit(folder.workspaceId, user, "folder.deleted", { type: "folder", id: folderId, name: folder.name });
  redirect(`/w/${folder.workspaceId}`);
}

export async function moveBoardToFolder(boardId: string, form: FormData) {
  const { board, user } = await requireBoardManager(boardId);
  const folderId = String(form.get("folderId") ?? "") || null;
  if (folderId && !(await db.folder.findFirst({ where: { id: folderId, workspaceId: board.workspaceId } }))) throw new Error("Unknown folder");
  await db.board.update({ where: { id: boardId }, data: { folderId } });
  await audit(board.workspaceId, user, "board.moved", { type: "board", id: board.id, name: board.title }, { folder: folderId });
  revalidatePath(`/w/${board.workspaceId}`);
}

// ── Custom templates ────────────────────────────────────────────────────────

const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;

/** Save a board's current elements (sent by the editor, which has the latest state) as a workspace template. */
export async function saveBoardAsTemplate(boardId: string, input: { name: string; description: string; elements: string }): Promise<ActionResult> {
  const user = await requireUser();
  const board = await db.board.findUniqueOrThrow({ where: { id: boardId } });
  if (!(await boardAccessForUser(user.id, board)).canEdit) return { error: "You need edit access to this board" };
  if (!atLeast(await workspaceRole(user.id, board.workspaceId), "MEMBER")) return { error: "Only workspace members can add templates" };
  const n = name.safeParse(input.name);
  if (!n.success) return { error: "Give the template a name" };
  if (input.elements.length > MAX_TEMPLATE_BYTES) return { error: "This board is too large to save as a template" };
  let elements: BoardElement[];
  try {
    const parsed = JSON.parse(input.elements);
    if (!Array.isArray(parsed) || !parsed.every((e) => e && typeof e.id === "string" && typeof e.type === "string")) throw new Error();
    elements = parsed;
  } catch {
    return { error: "Couldn't read the board" };
  }
  // Private notes and votes are personal; don't carry them into a template.
  elements = elements.filter((e) => !e.privateOwner);
  const tpl = await db.boardTemplate.create({
    data: {
      workspaceId: board.workspaceId, name: n.data, description: input.description.trim().slice(0, 200),
      elements: elements as unknown as object, createdById: user.id,
    },
  });
  await audit(board.workspaceId, user, "template.created", { type: "template", id: tpl.id, name: tpl.name }, { fromBoard: board.title });
  revalidatePath(`/w/${board.workspaceId}`);
  return { ok: true };
}

export async function deleteTemplate(templateId: string) {
  const user = await requireUser();
  const t = await db.boardTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const role = await workspaceRole(user.id, t.workspaceId);
  if (t.createdById !== user.id && !atLeast(role, "ADMIN")) throw new Error("Only the author or an admin can delete a template");
  await db.boardTemplate.delete({ where: { id: templateId } });
  await audit(t.workspaceId, user, "template.deleted", { type: "template", id: t.id, name: t.name });
  revalidatePath(`/w/${t.workspaceId}`);
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
  const { board, user } = await requireBoardManager(boardId);
  await db.board.delete({ where: { id: boardId } });
  await audit(board.workspaceId, user, "board.deleted", { type: "board", id: board.id, name: board.title });
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
  const { board, user } = await requireBoardManager(boardId);
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
  await audit(board.workspaceId, user, "board.sharing_changed", { type: "board", id: board.id, name: board.title }, {
    ...(data.linkAccess ? { linkAccess: { from: board.linkAccess, to: updated.linkAccess } } : {}),
    ...(data.visibility ? { visibility: { from: board.visibility, to: updated.visibility } } : {}),
    ...(data.teamId !== undefined ? { team: updated.teamId } : {}),
    ...(data.resetLink ? { linkReset: true } : {}),
  });
  return updated;
}
