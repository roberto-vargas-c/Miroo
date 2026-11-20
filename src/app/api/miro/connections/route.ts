import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { disconnectMiro, listMiroConnections, miroOAuth } from "@/lib/miroAuth";

/** The Miro teams this person connected, and whether "Connect Miro" is set up on this server. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json({ available: !!miroOAuth(), connections: await listMiroConnections(user.id) }, { headers: { "cache-control": "no-store" } });
}

/** Disconnects one Miro team (?id=). */
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!(await disconnectMiro(user.id, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
