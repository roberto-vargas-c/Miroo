import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { avatarUrl } from "@/lib/avatar";

const TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);
const MAX = 512 * 1024; // the browser shrinks pictures to 256 px before uploading

/** Sets (POST, raw image body) or removes (DELETE) the signed-in user's profile picture. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!TYPES.has(type)) return NextResponse.json({ error: "Use a PNG, JPEG or WebP picture" }, { status: 415 });
  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length || data.length > MAX) return NextResponse.json({ error: "That picture is too big" }, { status: 413 });
  const u = await db.user.update({
    where: { id: user.id }, data: { avatar: data, avatarMime: type, avatarVersion: { increment: 1 } }, select: { id: true, avatarVersion: true },
  });
  return NextResponse.json({ url: avatarUrl(u) });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  await db.user.update({ where: { id: user.id }, data: { avatar: null, avatarMime: null, avatarVersion: 0 } });
  return NextResponse.json({ ok: true });
}
