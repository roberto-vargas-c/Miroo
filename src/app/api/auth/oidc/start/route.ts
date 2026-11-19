import { NextResponse } from "next/server";
import { beginLogin, googleProvider, ssoProvider, FLOW_COOKIE } from "@/lib/auth/oidc";
import { APP_URL } from "@/lib/mail";

/** Start a Google (?provider=google) or workspace SSO (?workspace=<id>) sign-in. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const rawNext = u.searchParams.get("next") ?? "/w";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/w";
  const wid = u.searchParams.get("workspace");
  const provider = wid ? await ssoProvider(wid) : u.searchParams.get("provider") === "google" ? googleProvider() : null;
  const fail = (msg: string) => NextResponse.redirect(`${APP_URL()}/login?error=${encodeURIComponent(msg)}`);
  if (!provider) return fail(wid ? "Single sign-on isn't turned on for that workspace." : "Google sign-in isn't set up on this server.");
  try {
    const hint = u.searchParams.get("login_hint") ?? undefined;
    const { url, cookie } = await beginLogin(provider, next, hint);
    const res = NextResponse.redirect(url);
    res.cookies.set(FLOW_COOKIE, cookie, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/oidc", maxAge: 600,
    });
    return res;
  } catch (e) {
    console.error("[oidc] start failed", e);
    return fail("Couldn't reach the sign-in provider. Try again, or ask your admin to check the SSO settings.");
  }
}
