import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";

const authorSel = { select: { id: true, name: true, color: true } } as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  if (!r?.access.canView) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const comments = await db.comment.findMany({
    where: { boardId: id, parentId: null },
    orderBy: { createdAt: "asc" },
    include: { author: authorSel, replies: { orderBy: { createdAt: "asc" }, include: { author: authorSel } } },
  });
  return NextResponse.json({ comments });
}

const body = z.object({
  body: z.string().trim().min(1).max(4000),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  parentId: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  // Anyone signed in who can view the board can comment.
  if (!r?.access.canView || !r.user) return NextResponse.json({ error: "Sign in to comment" }, { status: 403 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  if (parsed.data.parentId) {
    const parent = await db.comment.findFirst({ where: { id: parsed.data.parentId, boardId: id, parentId: null } });
    if (!parent) return NextResponse.json({ error: "Unknown thread" }, { status: 400 });
  }
  const c = await db.comment.create({ data: { ...parsed.data, boardId: id, authorId: r.user.id }, include: { author: authorSel } });
  return NextResponse.json({ comment: c });
}
