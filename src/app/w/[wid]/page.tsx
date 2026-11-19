import Link from "next/link";
import { Star, Users, Lock, Folder, FolderPlus } from "lucide-react";
import { db } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { loadWorkspace } from "@/lib/workspace";
import { toggleStar, deleteBoard, createFolder, renameFolder, deleteFolder, moveBoardToFolder } from "@/app/actions/workspace";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { NewBoardButton } from "@/components/NewBoardButton";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function BoardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wid: string }>;
  searchParams: Promise<{ team?: string; starred?: string; q?: string; folder?: string }>;
}) {
  const { wid } = await params;
  const { team, starred, q, folder } = await searchParams;
  const { user, role, workspace } = await loadWorkspace(wid);
  const isAdmin = atLeast(role, "ADMIN");
  const myTeams = await db.teamMember.findMany({ where: { userId: user.id, team: { workspaceId: wid } }, select: { teamId: true } });
  const teams = await db.team.findMany({ where: { workspaceId: wid }, orderBy: { name: "asc" } });
  const folders = await db.folder.findMany({ where: { workspaceId: wid }, orderBy: { name: "asc" } });
  const currentFolder = folder ? folders.find((f) => f.id === folder) : undefined;
  const templates = await db.boardTemplate.findMany({
    where: { workspaceId: wid }, orderBy: { createdAt: "desc" },
    select: { id: true, name: true, description: true, createdById: true },
  });
  const templateAuthors = new Map((await db.user.findMany({
    where: { id: { in: templates.map((t) => t.createdById) } }, select: { id: true, name: true },
  })).map((u) => [u.id, u.name]));

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
      ...(currentFolder ? { folderId: currentFolder.id } : {}),
      ...(starred ? { stars: { some: { userId: user.id } } } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, updatedAt: true, visibility: true, createdById: true, folderId: true,
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
        {atLeast(role, "MEMBER") && (
          <NewBoardButton
            workspaceId={wid}
            teams={teams.map((t) => ({ id: t.id, name: t.name }))}
            folders={folders.map((f) => ({ id: f.id, name: f.name }))}
            folderId={currentFolder?.id ?? ""}
            customTemplates={templates.map((t) => ({
              id: t.id, name: t.name, description: t.description, by: templateAuthors.get(t.createdById) ?? "someone",
              canDelete: isAdmin || t.createdById === user.id,
            }))}
          />
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {tab("All boards", `/w/${wid}`, !team && !starred && !currentFolder)}
        {tab("Starred", `/w/${wid}?starred=1`, !!starred)}
        {teams.map((t) => tab(t.name, `/w/${wid}?team=${t.id}`, team === t.id))}
        <form className="ml-auto">
          <input name="q" defaultValue={q} placeholder="Search boards" className="input w-56" />
        </form>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {folders.map((f) => (
          <Link key={f.id} href={`/w/${wid}?folder=${f.id}`}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 ${currentFolder?.id === f.id ? "bg-brand-50 text-brand-700 ring-brand-300" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}>
            <Folder size={14} /> {f.name}
          </Link>
        ))}
        {atLeast(role, "MEMBER") && (
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-white hover:text-slate-700">
              <FolderPlus size={14} /> New folder
            </summary>
            <form action={createFolder.bind(null, wid)} className="card absolute left-0 top-10 z-20 flex w-72 gap-2 p-2">
              <input name="name" className="input py-1" placeholder="Folder name, e.g. Casa Lomas" required autoFocus />
              <button className="btn-primary py-1">Add</button>
            </form>
          </details>
        )}
      </div>

      {currentFolder && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Folder size={18} className="text-brand-600" />
          {atLeast(role, "MEMBER") ? (
            <form action={renameFolder.bind(null, currentFolder.id)} className="flex items-center gap-2">
              <input name="name" defaultValue={currentFolder.name} className="rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold hover:border-slate-200 focus:border-brand-500 focus:outline-none" aria-label="Folder name" />
            </form>
          ) : <h2 className="text-lg font-semibold">{currentFolder.name}</h2>}
          {isAdmin && (
            <ConfirmButton action={deleteFolder.bind(null, currentFolder.id)} message={`Delete the folder “${currentFolder.name}”? Its boards are kept and move out of the folder.`}
              className="ml-auto text-xs text-slate-400 hover:text-rose-600">
              Delete folder
            </ConfirmButton>
          )}
        </div>
      )}

      {boards.length === 0 ? (
        <div className="card mt-8 p-12 text-center text-slate-500">{currentFolder ? "This folder is empty. Create a board here, or move one in from All boards." : "No boards yet. Create one to get started."}</div>
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
                {canManage && folders.length > 0 && (
                  <div className="-mt-2 flex items-center gap-1.5 px-4 pb-3 text-xs text-slate-500">
                    <Folder size={12} />
                    <AutoSubmitSelect action={moveBoardToFolder.bind(null, b.id)} name="folderId" defaultValue={b.folderId ?? ""} label="Move to folder"
                      className="min-w-0 max-w-full cursor-pointer rounded border-0 bg-transparent py-0 pl-0 pr-6 text-xs text-slate-500 hover:text-slate-800 focus:ring-1 focus:ring-brand-300"
                      options={[{ value: "", label: "No folder" }, ...folders.map((f) => ({ value: f.id, label: f.name }))]} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
