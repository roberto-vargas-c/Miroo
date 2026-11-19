import type { BoardElement } from "@/lib/board/types";

type Patch = { id: string; patch: Partial<BoardElement> };
const GAP = 24;

/** Lays items out in a grid, in reading order, starting at their current top-left corner. */
export function tidyGrid(items: BoardElement[], origin?: { x: number; y: number }): Patch[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.height, b.height) / 2 ? a.y - b.y : a.x - b.x));
  const cols = Math.ceil(Math.sqrt(sorted.length));
  const cw = Math.max(...sorted.map((e) => e.width)) + GAP, ch = Math.max(...sorted.map((e) => e.height)) + GAP;
  const x0 = origin?.x ?? Math.min(...items.map((e) => e.x)), y0 = origin?.y ?? Math.min(...items.map((e) => e.y));
  return sorted.map((e, i) => ({ id: e.id, patch: { x: x0 + (i % cols) * cw, y: y0 + Math.floor(i / cols) * ch } }));
}

/** One grid per fill color, side by side, largest group first. */
export function clusterByColor(items: BoardElement[]): Patch[] {
  if (!items.length) return [];
  const groups = new Map<string, BoardElement[]>();
  for (const e of items) groups.set(e.fill, [...(groups.get(e.fill) ?? []), e]);
  const x0 = Math.min(...items.map((e) => e.x)), y0 = Math.min(...items.map((e) => e.y));
  let x = x0;
  const out: Patch[] = [];
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const patches = tidyGrid(g, { x, y: y0 });
    out.push(...patches);
    const cols = Math.ceil(Math.sqrt(g.length));
    x += cols * (Math.max(...g.map((e) => e.width)) + GAP) + 3 * GAP;
  }
  return out;
}

/** Adds every member of a selected item's group. */
export function withGroups(ids: string[], all: BoardElement[]): string[] {
  const byId = new Map(all.map((e) => [e.id, e]));
  const groups = new Set(ids.map((id) => byId.get(id)?.groupId).filter((g): g is string => !!g));
  if (!groups.size) return ids;
  return Array.from(new Set([...ids, ...all.filter((e) => e.groupId && groups.has(e.groupId)).map((e) => e.id)]));
}
