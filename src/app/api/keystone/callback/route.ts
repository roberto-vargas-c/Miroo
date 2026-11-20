import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/session";
import { APP_URL } from "@/lib/mail";
import { finishKeystoneConnect, readKeystoneFlow, KEYSTONE_CALLBACK_PATH, KEYSTONE_FLOW_COOKIE } from "@/lib/keystoneAuth";

/** Where Keystone sends people back after "Connect Keystone". Closes the popup, or returns to where they were. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const jar = await cookies();
  const flow = await readKeystoneFlow(jar.get(KEYSTONE_FLOW_COOKIE)?.value);
  jar.delete({ name: KEYSTONE_FLOW_COOKIE, path: KEYSTONE_CALLBACK_PATH });
  const user = await currentUser();

  let result: { ok: true; account: string | null } | { ok: false; error: string };
  const code = u.searchParams.get("code");
  if (u.searchParams.get("error")) result = { ok: false, error: "Keystone wasn't connected" };
  else if (!flow || !code || u.searchParams.get("state") !== flow.state || !user || user.id !== flow.userId) result = { ok: false, error: "That Keystone sign-in expired. Try Connect Keystone again" };
  else {
    try {
      const c = await finishKeystoneConnect(user.id, code);
      result = { ok: true, account: c.accountName };
    } catch (e) {
      console.error("[keystone] connect failed", e);
      result = { ok: false, error: "Keystone sign-in failed. Try again" };
    }
  }

  if (!flow?.popup) {
    const next = flow?.next ?? "/w";
    const sep = next.includes("?") ? "&" : "?";
    return NextResponse.redirect(`${APP_URL()}${next}${sep}keystone=${result.ok ? "connected" : encodeURIComponent(result.error)}`);
  }
  // Tell the board (which opened this window) and close. JSON-in-script is escaped so it can't break out.
  const msg = JSON.stringify({ type: "schema-keystone-connect", ...result }).replace(/</g, "\\u003c");
  const origin = JSON.stringify(APP_URL());
  const text = result.ok ? "Keystone is connected. You can close this window." : `Couldn't connect Keystone: ${result.error}`;
  const html = `<!doctype html><meta charset="utf-8"><title>Connect Keystone</title>
<body style="font:15px system-ui;padding:24px;color:#334155"><p id="t"></p>
<script>
var m = ${msg};
document.getElementById("t").textContent = ${JSON.stringify(text).replace(/</g, "\\u003c")};
try { if (window.opener) { window.opener.postMessage(m, ${origin}); window.close(); } } catch (e) {}
</script></body>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
