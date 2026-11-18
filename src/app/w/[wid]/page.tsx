import Link from "next/link";
import { Star, Users, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { loadWorkspace } from "@/lib/workspace";
import { toggleStar, deleteBoard } from "@/app/actions/workspace";
import { NewBoardButton } from "@/components/NewBoardButton";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function BoardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wid: string }>;
  searchParams: Promise<{ team?: string; starred?: string; q?: string }>;
}) {
  const { wid } = await params;
  const { team, starred, q } = await searchParams;
  const { user, role, workspace } = await loadWorkspace(wid);
  const isAdmin = atLeast(role, "ADMIN");
  const myTeams = await db.teamMember.findMany({ where: { userId: user.id, team: { workspaceId: wid } }, select: { teamId: true } });
  const teams = await db.team.findMany({ where: { workspaceId: wid }, orderBy: { name: "asc" } });

  const boards = await db.board.findMany({
    where: {
      workspaceId: wid,
      ...(isAdmin
        ? {}
        : {
            OR: [
              { visibility: "WORKSPACE" },
              { createdById: user.id },
              { visibility: "TEAM", teamId: { in: myTeams.map((t) => t.teamId) } },
            ],
          }),
      ...(team ? { teamId: team } : {}),
      ...(starred ? { stars: { some: { userId: user.id } } } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, updatedAt: true, visibility: true, createdById: true,
      team: { select: { name: true } },
      createdBy: { select: { name: true } },
      stars: { where: { userId: user.id }, select: { userId: true } },
    },
  });

  const tab = (label: string, href: string, active: boolean) => (
    <Link href={href} className={`rounded-full px-3 py-1 text-sm ${active ? "bg-ink text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{workspace.name}</h1>
          <p className="text-sm text-slate-500">Boards you can open in this workspace</p>
        </div>
        {atLeast(role, "MEMBER") && <NewBoardButton workspaceId={wid} teams={teams.map((t) => ({ id: t.id, name: t.name }))} />}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {tab("All boards", `/w/${wid}`, !team && !starred)}
        {tab("Starred", `/w/${wid}?starred=1`, !!starred)}
        {teams.map((t) => tab(t.name, `/w/${wid}?team=${t.id}`, team === t.id))}
        <form className="ml-auto">
          <input name="q" defaultValue={q} placeholder="Search boards" className="input w-56" />
        </form>
      </div>

      {boards.length === 0 ? (
        <div className="card mt-8 p-12 text-center text-slate-500">No boards yet. Create one to get started.</div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => {
            const canManage = isAdmin || b.createdById === user.id;
            const isStarred = b.stars.length > 0;
            return (
              <li key={b.id} className="card group overflow-hidden">
                <Link href={`/board/${b.id}`} className="block">
                  <div className="h-32 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] bg-slate-50" />
                </Link>
                <div className="flex items-start gap-2 p-4">
                  <Link href={`/board/${b.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {b.visibility === "TEAM" && <Users size={12} />}
                      {b.visibility === "PRIVATE" && <Lock size={12} />}
                      {b.team?.name ?? "Workspace"} · {b.createdBy.name} · {b.updatedAt.toLocaleDateString()}
                    </div>
                  </Link>
                  <form action={toggleStar.bind(null, b.id)}>
                    <button title={isStarred ? "Unstar" : "Star"} className="p-1 text-slate-400 hover:text-amber-500">
                      <Star size={16} fill={isStarred ? "#f59e0b" : "none"} color={isStarred ? "#f59e0b" : "currentColor"} />
                    </button>
                  </form>
                  {canManage && (
                    <ConfirmButton action={deleteBoard.bind(null, b.id)} message={`Delete “${b.title}”? This can't be undone.`}
                      className="p-1 text-xs text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100">
                      Delete
                    </ConfirmButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
