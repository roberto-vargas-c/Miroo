import { db } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { loadWorkspace } from "@/lib/workspace";
import { addTeamMember, createTeam, deleteTeam, removeTeamMember } from "@/app/actions/workspace";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/lib/avatar";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function TeamsPage({ params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { user, role } = await loadWorkspace(wid);
  const isAdmin = atLeast(role, "ADMIN");
  const teams = await db.team.findMany({
    where: { workspaceId: wid },
    include: {
      members: { include: { user: { select: { id: true, name: true, color: true, email: true, avatarVersion: true } } } },
      _count: { select: { boards: true } },
    },
    orderBy: { name: "asc" },
  });
  const wsMembers = await db.workspaceMember.findMany({ where: { workspaceId: wid }, include: { user: { select: { id: true, name: true } } } });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="text-sm text-slate-500">Group people so boards can be shared with just their team.</p>
      </div>

      {isAdmin && (
        <form action={createTeam.bind(null, wid)} className="card flex flex-wrap gap-2 p-5">
          <input name="name" required placeholder="Team name, e.g. Design" className="input min-w-0 flex-1" />
          <input name="description" placeholder="What does this team do? (optional)" className="input min-w-0 flex-[2]" />
          <button className="btn-primary">Create team</button>
        </form>
      )}

      {teams.length === 0 && <div className="card p-10 text-center text-slate-500">No teams yet.</div>}

      {teams.map((t) => {
        const lead = t.members.some((m) => m.userId === user.id && m.role === "LEAD");
        const canManage = isAdmin || lead;
        const memberIds = new Set(t.members.map((m) => m.userId));
        const addable = wsMembers.filter((m) => !memberIds.has(m.userId));
        return (
          <section key={t.id} className="card p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">{t.name}</h2>
                {t.description && <p className="text-sm text-slate-500">{t.description}</p>}
                <p className="mt-1 text-xs text-slate-400">{t.members.length} members · {t._count.boards} boards</p>
              </div>
              {isAdmin && (
                <ConfirmButton action={deleteTeam.bind(null, t.id)} message={`Delete team “${t.name}”? Its boards move to the whole workspace.`}
                  className="btn-ghost text-rose-600">Delete team</ConfirmButton>
              )}
            </div>
            <ul className="mt-4 divide-y divide-slate-100">
              {t.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <Avatar name={m.user.name} color={m.user.color} src={avatarUrl(m.user)} size={28} />
                  <span className="flex-1 text-sm">{m.user.name} <span className="text-slate-400">{m.user.email}</span></span>
                  <span className="text-xs text-slate-500">{m.role === "LEAD" ? "lead" : "member"}</span>
                  {canManage && (
                    <form action={removeTeamMember.bind(null, m.id)}><button className="btn-ghost py-1 text-xs text-rose-600">Remove</button></form>
                  )}
                </li>
              ))}
            </ul>
            {canManage && addable.length > 0 && (
              <form action={addTeamMember.bind(null, t.id)} className="mt-3 flex flex-wrap gap-2">
                <select name="userId" className="input w-auto flex-1">
                  {addable.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
                </select>
                <select name="role" className="input w-auto" defaultValue="MEMBER">
                  <option value="MEMBER">Member</option>
                  <option value="LEAD">Lead</option>
                </select>
                <button className="btn-outline">Add to team</button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
