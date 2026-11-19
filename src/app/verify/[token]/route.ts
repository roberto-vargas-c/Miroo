import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumeToken } from "@/lib/auth/tokens";
import { joinByDomain } from "@/lib/auth/domains";
import { APP_URL } from "@/lib/mail";

/** Email confirmation link. Confirming also joins company workspaces that auto-join the domain. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await consumeToken(token, "VERIFY_EMAIL");
  if (!user) return NextResponse.redirect(`${APP_URL()}/w?verified=expired`);
  const updated = await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
  await joinByDomain(updated);
  return NextResponse.redirect(`${APP_URL()}/w?verified=1`);
}
