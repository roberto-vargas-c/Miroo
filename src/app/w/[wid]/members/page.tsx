import { db } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { loadWorkspace } from "@/lib/workspace";
import { changeMemberRole, removeMember, revokeInvite } from "@/app/actions/workspace";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/lib/avatar";
import { InviteForm } from "@/components/InviteForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";

const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
const ROLE_HELP: Record<(typeof ROLES)[number], string> = {
  OWNER: "Full control, including deleting the workspace",
  ADMIN: "Manage members, teams and every board",
  MEMBER: "Create and edit boards",
  VIEWER: "View boards only",
};

export default async function MembersPage({ params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { user, role } = await loadWorkspace(wid);
  const isAdmin = atLeast(role, "ADMIN");
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: wid },
    include: { user: { select: { id: true, name: true, email: true, color: true, avatarVersion: true } } },
    orderBy: { createdAt: "asc" },
  });
  const invites = isAdmin
    ? await db.invite.findMany({ where: { workspaceId: wid, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } })
    : [];
  const base = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-slate-500">{members.length} people in this workspace</p>
      </div>

      {isAdmin && (
        <section className="card p-5">
          <h2 className="font-semibold">Invite people</h2>
          <p className="mb-3 text-sm text-slate-500">You'll get a link to send them. It works for 14 days.</p>
          <InviteForm workspaceId={wid} canInviteOwner={role === "OWNER"} />
        </section>
      )}

      <section className="card divide-y divide-slate-100">
        {members.map((m) => {
          const self = m.userId === user.id;
          const editable = isAdmin && !self && (m.role !== "OWNER" || role === "OWNER");
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar name={m.user.name} color={m.user.color} src={avatarUrl(m.user)} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.user.name} {self && <span className="text-xs text-slate-400">(you)</span>}</div>
                <div className="truncate text-sm text-slate-500">{m.user.email}</div>
              </div>
              {editable ? (
                <AutoSubmitSelect action={changeMemberRole.bind(null, m.id)} name="role" defaultValue={m.role}
                  options={ROLES.filter((r) => r !== "OWNER" || role === "OWNER").map((r) => ({ value: r, label: r.toLowerCase() }))} />
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600" title={ROLE_HELP[m.role]}>{m.role.toLowerCase()}</span>
              )}
              {(editable || self) && (
                <ConfirmButton action={removeMember.bind(null, m.id)} className="btn-ghost text-rose-600"
                  message={self ? "Leave this workspace?" : `Remove ${m.user.name} from the workspace?`}>
                  {self ? "Leave" : "Remove"}
                </ConfirmButton>
              )}
            </div>
          );
        })}
      </section>

      {invites.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Pending invites</h2>
          <div className="card divide-y divide-slate-100">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{i.email}</div>
                  <div className="truncate text-xs text-slate-500">{base}/invite/{i.token}</div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{i.role.toLowerCase()}</span>
                <form action={revokeInvite.bind(null, i.id)}><button className="btn-ghost text-rose-600">Revoke</button></form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="text-sm text-slate-500">
        <h2 className="mb-1 font-semibold text-slate-700">Roles</h2>
        <ul className="space-y-0.5">{ROLES.map((r) => <li key={r}><b className="font-medium">{r.toLowerCase()}</b>: {ROLE_HELP[r]}</li>)}</ul>
      </section>
    </div>
  );
}
