import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";

async function load(cid: string, req: Request) {
  const c = await db.comment.findUnique({ where: { id: cid } });
  if (!c) return null;
  const r = await boardAndAccess(c.boardId, new URL(req.url).searchParams.get("share"));
  if (!r?.user || !r.access.canView) return null;
  return { c, user: r.user, access: r.access };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const r = await load(cid, req);
  if (!r) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { resolved, body } = z.object({ resolved: z.boolean().optional(), body: z.string().trim().min(1).max(4000).optional() }).parse(await req.json());
  if (body !== undefined && r.c.authorId !== r.user.id) return NextResponse.json({ error: "Only the author can edit" }, { status: 403 });
  if (resolved !== undefined && !(r.access.canEdit || r.c.authorId === r.user.id)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const c = await db.comment.update({ where: { id: cid }, data: { resolved, body } });
  return NextResponse.json({ comment: c });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const r = await load(cid, req);
  if (!r || !(r.c.authorId === r.user.id || r.access.canManage)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  await db.comment.delete({ where: { id: cid } });
  return NextResponse.json({ ok: true });
}
