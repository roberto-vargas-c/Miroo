import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { KeystoneError, KEYSTONE_URL, keystoneFetch } from "@/lib/keystoneAuth";

type Project = { id: string; name?: string; city?: string; modified?: string; team?: string | null };

/** The person's Keystone projects, for "Add a Keystone model". { configured, connected, account, projects }. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!KEYSTONE_URL()) return NextResponse.json({ configured: false, connected: false, projects: [] });
  if (!(await db.keystoneConnection.findUnique({ where: { userId: user.id }, select: { id: true } }))) {
    return NextResponse.json({ configured: true, connected: false, projects: [] });
  }
  try {
    const { json, account } = await keystoneFetch(user.id, "/api/projects");
    const projects = (Array.isArray(json) ? (json as Project[]) : []).slice(0, 200).map((p) => ({
      id: String(p.id), name: p.name || String(p.id), city: p.city || null, modified: p.modified || null, team: p.team || null,
    }));
    return NextResponse.json({ configured: true, connected: true, account, projects }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof KeystoneError) return NextResponse.json({ configured: true, connected: !e.needsConnect, error: e.message, projects: [] }, { status: e.needsConnect ? 200 : e.status });
    return NextResponse.json({ configured: true, connected: true, error: "Couldn't reach Keystone. Try again", projects: [] }, { status: 502 });
  }
}

/** Disconnect Keystone from this account. */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await db.keystoneConnection.deleteMany({ where: { userId: user.id } });
  return new NextResponse(null, { status: 204 });
}
