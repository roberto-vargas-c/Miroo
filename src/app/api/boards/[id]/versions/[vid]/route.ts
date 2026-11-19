import { NextResponse } from "next/server";
import * as Y from "yjs";
import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";

/** The elements of one saved version, for previewing and restoring. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; vid: string }> }) {
  const { id, vid } = await params;
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  if (!r?.access.canEdit) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const v = await db.boardVersion.findFirst({ where: { id: vid, boardId: id }, select: { content: true } });
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(v.content));
  const elements = Array.from(doc.getMap("elements").values());
  doc.destroy();
  return NextResponse.json({ elements });
}
