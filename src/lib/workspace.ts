import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./session";

/** Loads the workspace for a /w/[wid] page and the viewer's role in it. */
export async function loadWorkspace(wid: string) {
  const user = await requireUser(`/w/${wid}`);
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: wid, userId: user.id } },
    include: { workspace: true },
  });
  if (!member) notFound();
  return { user, role: member.role, workspace: member.workspace };
}
