import { db } from "@/lib/db";

// Profile pictures are public to anyone who knows the user id (like names on a shared board).
export async function GET(_req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const u = await db.user.findUnique({ where: { id: uid }, select: { avatar: true, avatarMime: true } });
  if (!u?.avatar || !u.avatarMime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(u.avatar), {
    headers: { "content-type": u.avatarMime, "cache-control": "public, max-age=31536000, immutable" },
  });
}
