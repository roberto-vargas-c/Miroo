import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { APP_URL } from "@/lib/mail";
import { beginKeystoneConnect, KeystoneError, KEYSTONE_CALLBACK_PATH, KEYSTONE_FLOW_COOKIE } from "@/lib/keystoneAuth";

/** Starts "Connect Keystone". ?popup=1 when opened in a small window that closes itself afterwards. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const rawNext = u.searchParams.get("next") ?? "/w";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/w";
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${APP_URL()}/login?next=${encodeURIComponent(next)}`);
  try {
    const { url, cookie } = await beginKeystoneConnect(user.id, u.searchParams.get("popup") === "1", next);
    const res = NextResponse.redirect(url);
    res.cookies.set(KEYSTONE_FLOW_COOKIE, cookie, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: KEYSTONE_CALLBACK_PATH, maxAge: 900,
    });
    return res;
  } catch (e) {
    return new NextResponse(e instanceof KeystoneError ? e.message : "Couldn't start Connect Keystone", { status: 501 });
  }
}
