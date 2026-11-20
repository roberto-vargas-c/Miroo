import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/session";
import { APP_URL } from "@/lib/mail";
import { finishMiroConnect, readMiroFlow, MIRO_CALLBACK_PATH, MIRO_FLOW_COOKIE } from "@/lib/miroAuth";

/** Where Miro sends people back after "Connect Miro". Closes the popup, or returns to where they were. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const jar = await cookies();
  const flow = await readMiroFlow(jar.get(MIRO_FLOW_COOKIE)?.value);
  jar.delete({ name: MIRO_FLOW_COOKIE, path: MIRO_CALLBACK_PATH });
  const user = await currentUser();

  let result: { ok: true; team: string | null } | { ok: false; error: string };
  const code = u.searchParams.get("code");
  if (u.searchParams.get("error")) result = { ok: false, error: u.searchParams.get("error_description") ?? "Miro sign-in was cancelled" };
  else if (!flow || !code || u.searchParams.get("state") !== flow.state || !user || user.id !== flow.userId) result = { ok: false, error: "That Miro sign-in expired. Try Connect Miro again" };
  else {
    try {
      const t = await finishMiroConnect(user.id, code);
      result = { ok: true, team: t.teamName };
    } catch (e) {
      console.error("[miro] connect failed", e);
      result = { ok: false, error: "Miro sign-in failed. Try again" };
    }
  }

  if (!flow?.popup) {
    const next = flow?.next ?? "/w";
    const sep = next.includes("?") ? "&" : "?";
    return NextResponse.redirect(`${APP_URL()}${next}${sep}miro=${result.ok ? "connected" : encodeURIComponent(result.error)}`);
  }
  // Tell the board (which opened this window) and close. JSON-in-script is escaped so it can't break out.
  const msg = JSON.stringify({ type: "schema-miro-connect", ...result }).replace(/</g, "\\u003c");
  const origin = JSON.stringify(APP_URL());
  const text = result.ok ? "Miro is connected. You can close this window." : `Couldn't connect Miro: ${result.error}`;
  const html = `<!doctype html><meta charset="utf-8"><title>Connect Miro</title>
<body style="font:15px system-ui;padding:24px;color:#334155"><p id="t"></p>
<script>
var m = ${msg};
document.getElementById("t").textContent = ${JSON.stringify(text).replace(/</g, "\\u003c")};
try { if (window.opener) { window.opener.postMessage(m, ${origin}); window.close(); } } catch (e) {}
</script></body>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
