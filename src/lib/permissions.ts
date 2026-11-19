import { WorkspaceRole, type Board } from "@prisma/client";
import { db } from "./db";

export const ROLE_RANK: Record<WorkspaceRole, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function atLeast(role: WorkspaceRole | null | undefined, min: WorkspaceRole) {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function workspaceRole(userId: string, workspaceId: string) {
  const m = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

export type BoardAccess = { canView: boolean; canEdit: boolean; canManage: boolean; role: WorkspaceRole | null };
const NONE: BoardAccess = { canView: false, canEdit: false, canManage: false, role: null };

/** Access a signed-in user has to a board through workspace / team membership. */
export async function boardAccessForUser(
  userId: string,
  board: Pick<Board, "id" | "workspaceId" | "teamId" | "visibility" | "createdById">,
): Promise<BoardAccess> {
  const role = await workspaceRole(userId, board.workspaceId);
  if (!role) return NONE;
  const isAdmin = atLeast(role, "ADMIN");
  const isCreator = board.createdById === userId;
  let visible = isAdmin || isCreator;
  if (!visible) {
    if (board.visibility === "WORKSPACE") visible = true;
    else if (board.visibility === "TEAM" && board.teamId) {
      const tm = await db.teamMember.findUnique({
        where: { teamId_userId: { teamId: board.teamId, userId } },
      });
      visible = !!tm;
    }
  }
  if (!visible) return { ...NONE, role };
  const canEdit = atLeast(role, "MEMBER");
  return { canView: true, canEdit, canManage: isAdmin || isCreator, role };
}

/** Combine membership access with share-link access. */
export async function resolveBoardAccess(
  userId: string | null,
  board: Pick<Board, "id" | "workspaceId" | "teamId" | "visibility" | "createdById" | "linkAccess" | "shareToken">,
  shareToken?: string | null,
): Promise<BoardAccess> {
  const member = userId ? await boardAccessForUser(userId, board) : NONE;
  const viaLink = !!shareToken && shareToken === board.shareToken && board.linkAccess !== "NONE";
  if (!viaLink) return member;
  return {
    ...member,
    canView: true,
    canEdit: member.canEdit || board.linkAccess === "EDIT",
  };
}
