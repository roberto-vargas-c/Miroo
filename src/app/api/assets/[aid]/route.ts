import { db } from "@/lib/db";

// Asset ids are 128-bit random values, so the URL itself acts as the capability to read it.
export async function GET(_req: Request, { params }: { params: Promise<{ aid: string }> }) {
  const { aid } = await params;
  const a = await db.asset.findUnique({ where: { id: aid } });
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.data), {
    headers: { "content-type": a.mimeType, "cache-control": "private, max-age=31536000, immutable" },
  });
}
