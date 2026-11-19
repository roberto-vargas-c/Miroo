import { NextResponse } from "next/server";
import { z } from "zod";
import { boardAndAccess } from "@/lib/boardAccess";
import { AiError, aiEnabled, clusterItems, generateDiagram, generateIdeas, summarizeItems } from "@/lib/ai";

const item = z.object({ id: z.string().max(64), text: z.string().max(4000) });
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cluster"), items: z.array(item).min(2).max(300) }),
  z.object({ action: z.literal("summarize"), items: z.array(item).min(1).max(300) }),
  z.object({ action: z.literal("ideas"), topic: z.string().trim().min(1).max(2000), items: z.array(item).max(300) }),
  z.object({ action: z.literal("diagram"), description: z.string().trim().min(3).max(8000), kind: z.enum(["flowchart", "mindmap"]) }),
]);

const MAX_CHARS = 100_000;
const PER_HOUR = Number(process.env.AI_REQUESTS_PER_HOUR ?? 60);
const recent = new Map<string, number[]>();

/** Simple per-user limit, per server process. */
function allow(userId: string) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= PER_HOUR) { recent.set(userId, list); return false; }
  list.push(now);
  recent.set(userId, list);
  return true;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!aiEnabled()) return NextResponse.json({ error: "AI isn't set up on this server. An admin needs to add ANTHROPIC_API_KEY." }, { status: 503 });
  const r = await boardAndAccess(id, new URL(req.url).searchParams.get("share"));
  if (!r?.access.canEdit || !r.user) return NextResponse.json({ error: "Sign in with edit access to use AI on this board." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const tooMany = parsed.error.issues.some((i) => i.code === "too_big");
    return NextResponse.json({ error: tooMany ? "That's too much for one request. Select fewer items (up to 300) or shorten the text." : "Invalid request" }, { status: tooMany ? 413 : 400 });
  }
  const b = parsed.data;
  const items = "items" in b ? b.items.filter((i) => i.text.trim()) : [];
  if (items.reduce((n, i) => n + i.text.length, 0) > MAX_CHARS) {
    return NextResponse.json({ error: "The selected items have too much text for one request. Select fewer." }, { status: 413 });
  }
  if ((b.action === "cluster" && items.length < 2) || (b.action === "summarize" && !items.length)) {
    return NextResponse.json({ error: b.action === "cluster" ? "Select at least two notes with text." : "Select items with text to summarize." }, { status: 400 });
  }
  if (!allow(r.user.id)) return NextResponse.json({ error: `You've used AI ${PER_HOUR} times in the last hour. Try again later.` }, { status: 429 });

  try {
    switch (b.action) {
      case "cluster": return NextResponse.json(await clusterItems(items));
      case "summarize": return NextResponse.json(await summarizeItems(items));
      case "ideas": return NextResponse.json(await generateIdeas(b.topic, items));
      case "diagram": return NextResponse.json(await generateDiagram(b.description, b.kind));
    }
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[ai]", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
