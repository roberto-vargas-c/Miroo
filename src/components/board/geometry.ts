import type { BoardElement, ConnectorElement } from "@/lib/board/types";

export type Rect = { x: number; y: number; width: number; height: number };
export type Camera = { x: number; y: number; scale: number };

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;
export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function bounds(el: BoardElement): Rect {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

export function contains(outer: Rect, inner: Rect) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width); y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Point where the segment from the rect's center toward `toward` leaves the rect (plus a small gap). */
function edgePoint(r: Rect, toward: { x: number; y: number }, gap = 6) {
  const c = center(r);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = r.width / 2 + gap, hh = r.height / 2 + gap;
  const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return { x: c.x + dx * Math.min(t, 1), y: c.y + dy * Math.min(t, 1) };
}

/** Resolve a connector's endpoints, following the elements it's attached to. */
export function connectorPoints(c: ConnectorElement, byId: Map<string, BoardElement>) {
  const a = c.from.id ? byId.get(c.from.id) : undefined;
  const b = c.to.id ? byId.get(c.to.id) : undefined;
  const pa = a ? center(bounds(a)) : { x: c.from.x, y: c.from.y };
  const pb = b ? center(bounds(b)) : { x: c.to.x, y: c.to.y };
  const start = a ? edgePoint(bounds(a), pb) : pa;
  const end = b ? edgePoint(bounds(b), pa) : pb;
  return [start.x, start.y, end.x, end.y];
}

/** Topmost attachable element under a world point (connectors, pen strokes and frames' interiors excluded). */
export function hitElement(els: BoardElement[], p: { x: number; y: number }, excludeId?: string) {
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    if (e.id === excludeId || e.type === "connector" || e.type === "pen") continue;
    if (p.x >= e.x && p.x <= e.x + e.width && p.y >= e.y && p.y <= e.y + e.height) return e;
  }
  return undefined;
}
