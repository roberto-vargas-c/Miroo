import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { boardAndAccess } from "@/lib/boardAccess";
import { signRealtime } from "@/lib/token";

const GUEST_COLORS = ["#64748b", "#a16207", "#0e7490", "#9333ea"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = new URL(req.url).searchParams.get("share");
  const r = await boardAndAccess(id, share);
  if (!r || !r.access.canView) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { user, access } = r;
  const name = user?.name ?? "Guest";
  const color = user?.color ?? GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)];
  const sub = user?.id ?? `guest:${randomBytes(6).toString("hex")}`;
  const token = await signRealtime({
    sub,
    name,
    color,
    boardId: id,
    canEdit: access.canEdit,
  });
  return NextResponse.json({ token, id: sub, name, color, canEdit: access.canEdit });
}
