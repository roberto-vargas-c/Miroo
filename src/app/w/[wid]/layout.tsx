import { cookies } from "next/headers";
import { VerifyBanner } from "@/components/VerifyBanner";
import { loadWorkspace } from "@/lib/workspace";
import { loadSidebar } from "@/lib/sidebar";
import { WorkspaceShell } from "@/components/AppSidebar";
import { SIDEBAR_COOKIE } from "@/lib/sidebarCookie";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { user, role } = await loadWorkspace(wid);
  const [sidebar, jar] = await Promise.all([loadSidebar(wid, user, role), cookies()]);
  return (
    <WorkspaceShell data={sidebar} initialOpen={jar.get(SIDEBAR_COOKIE)?.value !== "closed"}>
      {!user.emailVerifiedAt && <VerifyBanner email={user.email} />}
      {children}
    </WorkspaceShell>
  );
}
