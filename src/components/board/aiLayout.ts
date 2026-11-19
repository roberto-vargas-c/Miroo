// Turns AI answers into board elements and positions. Pure functions; no network.
import {
  makeElement, STICKY_COLORS, type BoardElement, type ConnectorElement, type ShapeElement, type TopicElement,
} from "@/lib/board/types";

type Pt = { x: number; y: number };
const PALETTE = ["#0f8573", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04"];

function connector(a: BoardElement, b: BoardElement, color: string, arrow: boolean): ConnectorElement {
  const c = makeElement("connector", 0, 0) as ConnectorElement;
  return Object.assign(c, {
    width: 0, height: 0, stroke: color, arrowEnd: arrow, arrowStart: false,
    from: { id: a.id, x: a.x + a.width / 2, y: a.y + a.height / 2 },
    to: { id: b.id, x: b.x + b.width / 2, y: b.y + b.height / 2 },
  });
}

/** Rearrange notes into one frame per cluster, laid out in rows starting at `origin`. */
export function layoutClusters(
  clusters: { title: string; ids: string[] }[], byId: Map<string, BoardElement>, origin: Pt,
) {
  const updates: { id: string; patch: Partial<BoardElement> }[] = [];
  const frames: BoardElement[] = [];
  const gap = 24, pad = 32, framesPerRow = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(clusters.length))));
  let x = origin.x, y = origin.y, rowH = 0, col = 0;
  const z0 = Math.min(0, ...Array.from(byId.values()).map((e) => e.z)) - clusters.length - 1;
  clusters.forEach((c, i) => {
    const els = c.ids.map((id) => byId.get(id)).filter((e): e is BoardElement => !!e);
    if (!els.length) return;
    const cw = Math.max(...els.map((e) => e.width)), ch = Math.max(...els.map((e) => e.height));
    const cols = Math.max(1, Math.ceil(Math.sqrt(els.length)));
    const rows = Math.ceil(els.length / cols);
    const fw = pad * 2 + cols * cw + (cols - 1) * gap, fh = pad * 2 + rows * ch + (rows - 1) * gap;
    if (col === framesPerRow) { col = 0; x = origin.x; y += rowH + 90; rowH = 0; }
    els.forEach((e, k) => updates.push({ id: e.id, patch: { x: x + pad + (k % cols) * (cw + gap), y: y + pad + Math.floor(k / cols) * (ch + gap) } }));
    frames.push(makeElement("frame", x, y, { width: fw, height: fh, text: c.title, z: z0 + i, fill: "#ffffff", stroke: PALETTE[i % PALETTE.length] }));
    x += fw + 80; rowH = Math.max(rowH, fh); col++;
  });
  return { updates, frames };
}

/** A text block with the summary, placed at `at`. */
export function summaryElement(s: { title: string; points: string[]; next_steps: string[] }, at: Pt) {
  const lines = [s.title, "", ...s.points.map((p) => `• ${p}`), ...(s.next_steps.length ? ["", "Next steps", ...s.next_steps.map((p) => `→ ${p}`)] : [])];
  const width = 460;
  // Rough height: wrapped lines at ~52 characters per line, 16px text.
  const wrapped = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 52)), 0);
  return makeElement("text", at.x, at.y, { width, height: wrapped * 22 + 8, text: lines.join("\n"), fontSize: 16, stroke: "#0f172a" });
}

/** New sticky notes for ideas, in a grid starting at `at`. */
export function ideaStickies(ideas: string[], at: Pt) {
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(ideas.length))));
  return ideas.map((t, i) => makeElement("sticky", at.x + (i % cols) * 200, at.y + Math.floor(i / cols) * 200, {
    text: t, fill: STICKY_COLORS[3], z: Date.now() + i,
  }));
}

type DNode = { id: string; label: string; kind: "start_end" | "step" | "decision" | "data"; parent: string };
type DEdge = { from: string; to: string; label: string };

/** Flowchart: top-to-bottom layers by distance from the start nodes. */
export function flowchartElements(nodes: DNode[], edges: DEdge[], at: Pt) {
  const out = new Map<string, string[]>(), indeg = new Map<string, number>();
  nodes.forEach((n) => { out.set(n.id, []); indeg.set(n.id, 0); });
  edges.forEach((e) => { out.get(e.from)!.push(e.to); indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1); });
  const level = new Map<string, number>();
  const starts = nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  const queue = (starts.length ? starts : nodes.slice(0, 1).map((n) => n.id)).map((id) => { level.set(id, 0); return id; });
  while (queue.length) {
    const id = queue.shift()!;
    for (const to of out.get(id) ?? []) if (!level.has(to)) { level.set(to, level.get(id)! + 1); queue.push(to); }
  }
  let maxLevel = Math.max(0, ...level.values());
  nodes.forEach((n) => { if (!level.has(n.id)) level.set(n.id, ++maxLevel); });
  const layers = new Map<number, DNode[]>();
  nodes.forEach((n) => { const l = level.get(n.id)!; layers.set(l, [...(layers.get(l) ?? []), n]); });
  const widest = Math.max(...Array.from(layers.values()).map((l) => l.length));
  const colW = 260, rowH = 160;
  const els = new Map<string, BoardElement>();
  const z = Date.now();
  for (const [l, layer] of layers) {
    const offset = ((widest - layer.length) * colW) / 2;
    layer.forEach((n, i) => {
      const cx = at.x + offset + i * colW + colW / 2, cy = at.y + l * rowH + 50;
      let el: BoardElement;
      if (n.kind === "start_end") el = makeElement("ellipse", cx - 90, cy - 35, { width: 180, height: 70, fill: "#ccfbf1", stroke: "#0f766e" });
      else if (n.kind === "decision") el = makeElement("diamond", cx - 100, cy - 55, { width: 200, height: 110, fill: "#fef3c7", stroke: "#b45309" });
      else if (n.kind === "data") {
        el = makeElement("shape", cx - 95, cy - 40, { width: 190, height: 80, fill: "#e0e7ff", stroke: "#4338ca" });
        (el as ShapeElement).shape = "document";
      } else el = makeElement("rect", cx - 100, cy - 40, { width: 200, height: 80, fill: "#ffffff", stroke: "#1f2937" });
      el.text = n.label;
      el.fontSize = 15;
      el.z = z + els.size;
      els.set(n.id, el);
    });
  }
  const result: BoardElement[] = Array.from(els.values());
  edges.forEach((e) => {
    const a = els.get(e.from)!, b = els.get(e.to)!;
    result.push(connector(a, b, "#475569", true));
    if (e.label.trim()) {
      const mx = (a.x + a.width / 2 + b.x + b.width / 2) / 2, my = (a.y + a.height / 2 + b.y + b.height / 2) / 2;
      result.push(makeElement("text", mx + 8, my - 12, { width: 80, height: 24, text: e.label.trim().slice(0, 30), fontSize: 14, stroke: "#475569" }));
    }
  });
  return result;
}

/** Mind map: the root on the left, branches spread to the right by subtree size. */
export function mindmapElements(nodes: DNode[], at: Pt) {
  const kids = new Map<string, DNode[]>();
  nodes.forEach((n) => { if (n.parent) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]); });
  const root = nodes.find((n) => !n.parent) ?? nodes[0];
  if (!root) return [];
  const leaves = new Map<string, number>();
  const count = (n: DNode, seen: Set<string>): number => {
    if (seen.has(n.id)) return 1;
    seen.add(n.id);
    const c = (kids.get(n.id) ?? []).reduce((s, k) => s + count(k, seen), 0) || 1;
    leaves.set(n.id, c);
    return c;
  };
  count(root, new Set());
  const rowH = 64, colW = 250;
  const result: BoardElement[] = [];
  const placed = new Set<string>();
  const place = (n: DNode, depth: number, top: number, parentEl: TopicElement | null, color: string) => {
    if (placed.has(n.id)) return;
    placed.add(n.id);
    const span = (leaves.get(n.id) ?? 1) * rowH;
    const h = depth === 0 ? 56 : 44;
    const el = makeElement("topic", at.x + depth * colW, top + span / 2 - h / 2, {
      width: depth === 0 ? 200 : 180, height: h, text: n.label, fontSize: depth === 0 ? 18 : 15,
      fill: depth === 0 ? "#0f8573" : "#ffffff", stroke: depth === 0 ? "#0f8573" : color,
    }) as TopicElement;
    el.root = parentEl?.root ?? el.id;
    el.level = depth;
    result.push(el);
    if (parentEl) result.push(connector(parentEl, el, color, false));
    let y = top;
    (kids.get(n.id) ?? []).forEach((k, i) => {
      place(k, depth + 1, y, el, depth === 0 ? PALETTE[i % PALETTE.length] : color);
      y += (leaves.get(k.id) ?? 1) * rowH;
    });
  };
  place(root, 0, at.y, null, PALETTE[0]);
  return result;
}
