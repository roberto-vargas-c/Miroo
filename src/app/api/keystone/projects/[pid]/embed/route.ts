import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { KeystoneError, keystoneFetch } from "@/lib/keystoneAuth";
import { isKeystoneEmbed } from "@/components/board/embeds";

/**
 * The live 3D model's embed link of a Keystone project: the one it has, or a new one when it has none (a link that is on
 * is never replaced, so boards that show it keep working). { url }.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ pid: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { pid } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(pid)) return NextResponse.json({ error: "Unknown project" }, { status: 404 });
  try {
    const path = `/api/projects/${pid}/embed`;
    let { json } = await keystoneFetch(user.id, path);
    let e = json as { on?: boolean; url?: string };
    if (!e?.on) ({ json } = await keystoneFetch(user.id, path, { method: "POST" })), (e = json as typeof e);
    if (!e?.url || !/^https?:\/\//.test(e.url)) return NextResponse.json({ error: "Keystone made no embed link" }, { status: 502 });
    return NextResponse.json({ url: e.url, recognised: isKeystoneEmbed(e.url) });
  } catch (x) {
    if (x instanceof KeystoneError) return NextResponse.json({ error: x.message, needsConnect: x.needsConnect || undefined }, { status: x.status });
    return NextResponse.json({ error: "Couldn't reach Keystone. Try again" }, { status: 502 });
  }
}
