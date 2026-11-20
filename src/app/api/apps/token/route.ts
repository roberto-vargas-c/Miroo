import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangeCode } from "@/lib/apps";

const Body = z.object({ code: z.string().min(10).max(2000), redirect_uri: z.string().url().max(500) });

/** An app's server trades the one-time code for its token (src/lib/apps.ts). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { code, redirect_uri }" }, { status: 400 });
  const r = await exchangeCode(parsed.data.code, parsed.data.redirect_uri);
  if (!r) return NextResponse.json({ error: "That code is unknown, expired or used" }, { status: 400 });
  return NextResponse.json({ token: r.token, user: { name: r.user.name, email: r.user.email } }, { headers: { "cache-control": "no-store" } });
}
