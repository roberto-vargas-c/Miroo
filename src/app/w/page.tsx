import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function WorkspacesIndex() {
  const user = await requireUser("/w");
  const m = await db.workspaceMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  redirect(m ? `/w/${m.workspaceId}` : "/w/new");
}
