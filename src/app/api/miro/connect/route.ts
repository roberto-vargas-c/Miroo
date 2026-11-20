import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { APP_URL } from "@/lib/mail";
import { beginMiroConnect, miroOAuth, MIRO_CALLBACK_PATH, MIRO_FLOW_COOKIE } from "@/lib/miroAuth";

/** Starts "Connect Miro". ?popup=1 when opened in a small window that closes itself afterwards. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const rawNext = u.searchParams.get("next") ?? "/w";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/w";
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${APP_URL()}/login?next=${encodeURIComponent(next)}`);
  if (!miroOAuth()) return new NextResponse("Connect Miro isn't set up on this server (MIRO_CLIENT_ID and MIRO_CLIENT_SECRET).", { status: 501 });
  const { url, cookie } = await beginMiroConnect(user.id, u.searchParams.get("popup") === "1", next);
  const res = NextResponse.redirect(url);
  res.cookies.set(MIRO_FLOW_COOKIE, cookie, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: MIRO_CALLBACK_PATH, maxAge: 900,
  });
  return res;
}
