import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";

const Body = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/** Updates the signed-in user's display name and cursor color. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });
  await db.user.update({ where: { id: user.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
