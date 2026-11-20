import * as Y from "yjs";
import type { BoardElement } from "./types";

/** Space left between what is already on the board and what an app adds. */
const GAP = 200;

/**
 * Adds elements laid out from (0, 0) to a board document, to the right of everything already on it (top-aligned with it),
 * and above it in stacking order (frames stay behind). Used for what other apps send in, such as Keystone's sheets and views.
 * Returns the area the new elements take.
 */
export function dropElements(doc: Y.Doc, elements: BoardElement[]) {
  const map = doc.getMap<BoardElement>("elements");
  let maxX = -Infinity, minY = Infinity, maxZ = 0;
  map.forEach((e) => {
    if (!e || typeof e.x !== "number") return;
    maxX = Math.max(maxX, e.x + (e.width || 0));
    minY = Math.min(minY, e.y);
    if (e.type !== "frame") maxZ = Math.max(maxZ, e.z || 0);
  });
  const dx = Number.isFinite(maxX) ? maxX + GAP : 0, dy = Number.isFinite(minY) ? minY : 0;
  const base = Math.max(maxZ, Date.now());
  let w = 0, h = 0;
  doc.transact(() => {
    elements.forEach((e, i) => {
      w = Math.max(w, e.x + e.width); h = Math.max(h, e.y + e.height);
      map.set(e.id, { ...e, x: e.x + dx, y: e.y + dy, z: e.type === "frame" ? e.z : base + i + 1 });
    });
  }, "app");
  return { x: dx, y: dy, width: w, height: h };
}
