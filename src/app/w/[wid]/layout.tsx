import Link from "next/link";
import { LayoutGrid, Users, UserCog, Settings, LogOut, ScrollText, UserRound } from "lucide-react";
import { atLeast } from "@/lib/permissions";
import { VerifyBanner } from "@/components/VerifyBanner";
import { db } from "@/lib/db";
import { loadWorkspace } from "@/lib/workspace";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/lib/avatar";
import { InstallButton } from "@/components/InstallButton";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { user, workspace, role } = await loadWorkspace(wid);
  const all = await db.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const nav = [
    { href: `/w/${wid}`, label: "Boards", icon: LayoutGrid },
    { href: `/w/${wid}/teams`, label: "Teams", icon: Users },
    { href: `/w/${wid}/members`, label: "Members", icon: UserCog },
    { href: `/w/${wid}/settings`, label: "Settings", icon: Settings },
    ...(atLeast(role, "ADMIN") ? [{ href: `/w/${wid}/audit`, label: "Audit log", icon: ScrollText }] : []),
    { href: `/w/${wid}/profile`, label: "Profile", icon: UserRound },
  ];
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 border-b border-slate-200 bg-white p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <Link href="/w"><Logo /></Link>
        <WorkspaceSwitcher current={{ id: workspace.id, name: workspace.name }} all={all.map((m) => m.workspace)} />
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="btn-ghost justify-start whitespace-nowrap">
              <Icon size={16} /> {label}
            </Link>
          ))}
          <InstallButton />
        </nav>
        <div className="mt-auto hidden items-center gap-2 md:flex">
          <Link href={`/w/${wid}/profile`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg hover:bg-slate-50" title="Your profile">
            <Avatar name={user.name} color={user.color} src={avatarUrl(user)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">{role.toLowerCase()}</div>
            </div>
          </Link>
          <form action={logout}>
            <button className="btn-ghost p-2" title="Log out"><LogOut size={16} /></button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {!user.emailVerifiedAt && <VerifyBanner email={user.email} />}
        {children}
      </main>
    </div>
  );
}
