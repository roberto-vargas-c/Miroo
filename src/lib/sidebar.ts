import "server-only";
import type { WorkspaceRole } from "@prisma/client";
import { db } from "./db";
import { atLeast } from "./permissions";
import { avatarUrl } from "./avatar";

export type SidebarData = {
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  user: { name: string; color: string; avatar: string | null; role: string };
  isAdmin: boolean;
  folders: { id: string; name: string; starred: boolean }[];
  starredBoards: { id: string; title: string }[];
};

/** Everything the app sidebar shows: workspaces, projects (folders) and the viewer's starred boards and projects. */
export async function loadSidebar(
  wid: string,
  user: { id: string; name: string; color: string; avatarVersion: number },
  role: WorkspaceRole,
): Promise<SidebarData> {
  const isAdmin = atLeast(role, "ADMIN");
  const [workspace, memberships, folders, folderStars, myTeams] = await Promise.all([
    db.workspace.findUnique({ where: { id: wid }, select: { id: true, name: true } }),
    db.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.folder.findMany({ where: { workspaceId: wid }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.folderStar.findMany({ where: { userId: user.id, folder: { workspaceId: wid } }, select: { folderId: true } }),
    db.teamMember.findMany({ where: { userId: user.id, team: { workspaceId: wid } }, select: { teamId: true } }),
  ]);
  // Only boards the viewer can still open (a starred board may since have gone private).
  const starredBoards = await db.board.findMany({
    where: {
      workspaceId: wid,
      stars: { some: { userId: user.id } },
      ...(isAdmin ? {} : {
        OR: [
          { visibility: "WORKSPACE" },
          { createdById: user.id },
          { visibility: "TEAM", teamId: { in: myTeams.map((t) => t.teamId) } },
        ],
      }),
    },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  const starredFolders = new Set(folderStars.map((s) => s.folderId));
  return {
    workspace: workspace ?? { id: wid, name: "" },
    workspaces: memberships.map((m) => m.workspace),
    user: { name: user.name, color: user.color, avatar: avatarUrl(user) ?? null, role: role.toLowerCase() },
    isAdmin,
    folders: folders.map((f) => ({ ...f, starred: starredFolders.has(f.id) })),
    starredBoards,
  };
}
