import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { acceptInvite } from "@/app/actions/workspace";
import { Logo } from "@/components/Logo";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.invite.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });
  const user = await currentUser();
  const valid = inv && !inv.acceptedAt && inv.expiresAt > new Date();
  const next = `/invite/${token}`;
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 bg-gradient-to-br from-brand-50 via-white to-amber-50 p-6">
      <Logo />
      <div className="card w-full max-w-sm space-y-4 p-7 text-center">
        {!valid ? (
          <p>This invite link has expired or was already used.</p>
        ) : (
          <>
            <p><b>{inv.invitedBy.name}</b> invited you to join <b>{inv.workspace.name}</b> as {inv.role.toLowerCase()}.</p>
            {user ? (
              <form action={acceptInvite.bind(null, token)}>
                <button className="btn-primary w-full">Join as {user.name}</button>
              </form>
            ) : (
              <div className="flex flex-col gap-2">
                <Link className="btn-primary" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account to join</Link>
                <Link className="btn-outline" href={`/login?next=${encodeURIComponent(next)}`}>I already have an account</Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
