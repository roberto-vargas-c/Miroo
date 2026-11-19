import { NextResponse } from "next/server";
import * as Y from "yjs";
import { db } from "@/lib/db";
import { boardAndAccess } from "@/lib/boardAccess";

const MAX_STATE_BYTES = 40 * 1024 * 1024;

/** Version history is for people who can edit the board. */
async function editor(req: Request, id: string) {
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  return r?.access.canEdit ? r : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await editor(req, id))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const versions = await db.boardVersion.findMany({
    where: { boardId: id },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, label: true, auto: true, elementCount: true, createdAt: true, createdById: true },
  });
  const ids = Array.from(new Set(versions.map((v) => v.createdById).filter((x): x is string => !!x)));
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return NextResponse.json({
    versions: versions.map(({ createdById, ...v }) => ({ ...v, by: createdById ? names.get(createdById) ?? null : null })),
  });
}

/** Save a named version. The body is the client's current Yjs state (it has the latest edits). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await editor(req, id);
  if (!r) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const label = (new URL(req.url).searchParams.get("label") ?? "").trim().slice(0, 120) || null;
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX_STATE_BYTES) return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, buf);
  } catch {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }
  const v = await db.boardVersion.create({
    data: {
      boardId: id, content: Buffer.from(Y.encodeStateAsUpdate(doc)), label, auto: false,
      elementCount: doc.getMap("elements").size, createdById: r.user?.id ?? null,
    },
    select: { id: true },
  });
  doc.destroy();
  return NextResponse.json({ id: v.id });
}
