import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { listMiroBoards, MiroError } from "@/lib/miroAuth";

/** The boards in the person's connected Miro teams, for "Migrate from Miro". */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    return NextResponse.json(await listMiroBoards(user.id), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof MiroError) return NextResponse.json({ error: e.message, needsConnect: e.needsConnect || undefined }, { status: e.status });
    return NextResponse.json({ error: "Couldn't reach Miro. Try again" }, { status: 502 });
  }
}
