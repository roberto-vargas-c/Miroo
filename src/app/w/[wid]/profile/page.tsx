import { requireUser } from "@/lib/session";
import { avatarUrl } from "@/lib/avatar";
import { db } from "@/lib/db";
import { APPS } from "@/lib/apps";
import { ProfileForm } from "@/components/ProfileForm";
import { disconnectApp, disconnectKeystone } from "@/app/actions/apps";

const day = (d: Date) => d.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });

export default async function ProfilePage() {
  const user = await requireUser();
  const [tokens, keystone] = await Promise.all([
    db.appToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.keystoneConnection.findUnique({ where: { userId: user.id } }),
  ]);
  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">Your profile</h1>
      <p className="mb-6 text-sm text-slate-500">Your name and picture show on boards, comments and sticky notes you write.</p>
      <ProfileForm user={{ name: user.name, email: user.email, color: user.color, avatar: avatarUrl(user) ?? null }} />

      <h2 className="mb-1 mt-10 text-lg font-semibold">Connected apps</h2>
      <p className="mb-3 text-sm text-slate-500">Apps you allowed to add to your boards, and accounts your boards read from.</p>
      {tokens.length === 0 && !keystone ? (
        <p className="text-sm text-slate-500">None yet. Keystone can send its sheets and views here (Send to Schema), and the embed dialog on a board adds Keystone 3D models.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <b>{APPS[t.app]?.name ?? t.app}</b> can add to your boards
                <span className="block text-xs text-slate-500">Connected {day(t.createdAt)}{t.lastUsedAt ? ` · last used ${day(t.lastUsedAt)}` : ""}</span>
              </span>
              <form action={disconnectApp.bind(null, t.id)}><button className="btn-ghost border border-slate-200">Disconnect</button></form>
            </li>
          ))}
          {keystone && (
            <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                Boards show 3D models from <b>Keystone</b>{keystone.accountName ? ` as ${keystone.accountName}` : ""}
                <span className="block text-xs text-slate-500">Connected {day(keystone.createdAt)}{keystone.accountEmail ? ` · ${keystone.accountEmail}` : ""}</span>
              </span>
              <form action={disconnectKeystone}><button className="btn-ghost border border-slate-200">Disconnect</button></form>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
