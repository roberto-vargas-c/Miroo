import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";
import { BoardApp } from "@/components/board/BoardApp";
import { aiEnabled } from "@/lib/ai";

export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ share?: string }> }) {
  const { id } = await params;
  const { share } = await searchParams;
  const r = await boardAndAccess(id, share ?? null);
  if (!r) notFound();
  const { board, user, access } = r;
  if (!access.canView) {
    if (!user) redirect(`/login?next=${encodeURIComponent(`/board/${id}${share ? `?share=${share}` : ""}`)}`);
    notFound();
  }
  const isMember = !!access.role;
  const teams = isMember ? await db.team.findMany({ where: { workspaceId: board.workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const members = isMember
    ? (await db.workspaceMember.findMany({ where: { workspaceId: board.workspaceId }, select: { user: { select: { id: true, name: true, color: true } } } }))
        .map((m) => m.user).sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const [folders, starred, creator] = await Promise.all([
    isMember ? db.folder.findMany({ where: { workspaceId: board.workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    user ? db.boardStar.findUnique({ where: { userId_boardId: { userId: user.id, boardId: board.id } } }).then(Boolean) : false,
    isMember ? db.user.findUnique({ where: { id: board.createdById }, select: { name: true } }) : null,
  ]);
  return (
    <BoardApp
      boardId={board.id}
      title={board.title}
      workspaceId={isMember ? board.workspaceId : null}
      user={user ? { id: user.id, name: user.name, color: user.color } : null}
      canEdit={access.canEdit}
      canManage={access.canManage}
      shareToken={share ?? null}
      sharing={isMember ? { linkAccess: board.linkAccess, visibility: board.visibility, teamId: board.teamId, shareToken: board.shareToken } : null}
      teams={teams}
      members={members}
      realtimeUrl={process.env.NEXT_PUBLIC_REALTIME_URL || "ws://localhost:1234"}
      ai={aiEnabled()}
      starred={starred}
      folders={folders}
      details={isMember ? {
        folderId: board.folderId, createdBy: creator?.name ?? null,
        createdAt: board.createdAt.toISOString(), updatedAt: board.updatedAt.toISOString(),
      } : null}
    />
  );
}
