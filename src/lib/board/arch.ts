// Architecture helpers: real-world scale, unit formatting, plan symbols and revision clouds.
import type { BoardElement, ImageElement } from "./types";

export type Unit = "m" | "cm" | "mm" | "ft";
export const UNITS: { id: Unit; label: string }[] = [
  { id: "m", label: "Meters" },
  { id: "cm", label: "Centimeters" },
  { id: "mm", label: "Millimeters" },
  { id: "ft", label: "Feet & inches" },
];
export const TO_METERS: Record<Unit | "in", number> = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };

/** Board-wide fallback scale for areas not covered by a scaled plan. */
export type BoardScale = { metersPerPx: number } | null;

/** One PDF point (1/72 inch) in meters. */
export const PT_IN_METERS = 0.0254 / 72;

/** When nothing is scaled yet, symbols are sized as if 1 m = 50 world px. */
export const DEFAULT_PX_PER_METER = 50;

export function metersPerPxOfPlan(el: ImageElement): number | null {
  if (!el.scale) return null;
  return (el.scale.metersPerPx * el.scale.refWidth) / Math.max(1, el.width);
}

/** Meters per world pixel at a point: the topmost scaled plan under it, else the board scale. */
export function metersPerPxAt(elements: BoardElement[], p: { x: number; y: number }, board: BoardScale): number | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.type !== "image" || !(e as ImageElement).scale) continue;
    if (p.x >= e.x && p.x <= e.x + e.width && p.y >= e.y && p.y <= e.y + e.height) return metersPerPxOfPlan(e as ImageElement);
  }
  return board?.metersPerPx ?? null;
}

export function formatLength(m: number, unit: Unit) {
  switch (unit) {
    case "cm": return `${(m * 100).toFixed(1)} cm`;
    case "mm": return `${Math.round(m * 1000)} mm`;
    case "ft": {
      const totalIn = m / TO_METERS.in;
      let ft = Math.floor(totalIn / 12);
      let inch = Math.round(totalIn - ft * 12);
      if (inch === 12) { ft += 1; inch = 0; }
      return `${ft}′ ${inch}″`;
    }
    default: return `${m.toFixed(2)} m`;
  }
}

export function formatArea(m2: number, unit: Unit) {
  if (unit === "ft") return `${(m2 / (0.3048 * 0.3048)).toFixed(1)} ft²`;
  return `${m2.toFixed(2)} m²`;
}

export function polygonArea(pts: number[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const j = (i + 2) % pts.length;
    a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
  }
  return Math.abs(a) / 2;
}

export function polylineLength(pts: number[], closed = false) {
  let l = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const j = (i + 1) % n;
    l += Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]);
  }
  return l;
}

export function polygonCentroid(pts: number[]) {
  let x = 0, y = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) { x += pts[i]; y += pts[i + 1]; }
  return { x: x / n, y: y / n };
}

/** Snap a vector to 15° steps (hold Shift while drawing). */
export function snapAngle(x0: number, y0: number, x1: number, y1: number) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.PI / 12;
  const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / step) * step;
  return { x: x0 + Math.cos(a) * len, y: y0 + Math.sin(a) * len };
}

/** SVG path for a revision cloud around a w×h rect (scallops bulge outward). */
export function cloudPath(w: number, h: number, r = 14) {
  const seg = (len: number) => Math.max(1, Math.round(len / (r * 1.6)));
  const parts = [`M0 0`];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const n = seg(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      const rr = Math.hypot(x1 - x0, y1 - y0) / n / 1.6;
      parts.push(`A${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
  };
  edge(0, 0, w, 0);
  edge(w, 0, w, h);
  edge(w, h, 0, h);
  edge(0, h, 0, 0);
  return parts.join(" ") + " Z";
}

// ── Plan symbol library ────────────────────────────────────────────────────
// Each symbol is drawn in its own viewBox (vb) and has a real-world default size in meters.

export type SymbolDef = {
  id: string;
  name: string;
  group: "Openings" | "Structure" | "Bath" | "Kitchen" | "Furniture" | "Site" | "Annotation";
  vb: [number, number];
  size: [number, number]; // meters
  d: string;
  fill?: string;
};

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;

export const SYMBOLS: SymbolDef[] = [
  { id: "door", name: "Door", group: "Openings", vb: [100, 100], size: [0.9, 0.9], d: "M0 100 L0 0 M0 0 A100 100 0 0 1 100 100 M0 100 H100" },
  { id: "door-double", name: "Double door", group: "Openings", vb: [100, 50], size: [1.6, 0.8], d: "M0 50 V0 A50 50 0 0 1 50 50 M100 50 V0 A50 50 0 0 0 50 50 M0 50 H100" },
  { id: "door-sliding", name: "Sliding door", group: "Openings", vb: [100, 16], size: [1.8, 0.2], d: "M0 0 H100 V16 H0 Z M4 5 H56 M44 11 H96" },
  { id: "window", name: "Window", group: "Openings", vb: [100, 16], size: [1.2, 0.2], d: "M0 0 H100 V16 H0 Z M0 8 H100" },
  { id: "column", name: "Column", group: "Structure", vb: [100, 100], size: [0.4, 0.4], d: "M0 0 H100 V100 H0 Z M0 0 L100 100 M100 0 L0 100" },
  { id: "column-round", name: "Round column", group: "Structure", vb: [100, 100], size: [0.4, 0.4], d: `${circle(50, 50, 50)} M15 15 L85 85 M85 15 L15 85` },
  {
    id: "stairs", name: "Stairs", group: "Structure", vb: [100, 280], size: [1.0, 2.8],
    d: "M0 0 H100 V280 H0 Z " + Array.from({ length: 13 }, (_, i) => `M0 ${(i + 1) * 20} H100`).join(" ") + " M50 270 V12 M40 26 L50 12 L60 26",
  },
  { id: "toilet", name: "Toilet", group: "Bath", vb: [60, 100], size: [0.4, 0.7], d: "M5 0 H55 V22 H5 Z M30 28 C58 28 58 98 30 98 C2 98 2 28 30 28 Z" },
  { id: "sink", name: "Washbasin", group: "Bath", vb: [100, 70], size: [0.6, 0.45], d: "M0 0 H100 V70 H0 Z M18 14 H82 Q90 14 90 24 V52 Q90 62 80 62 H20 Q10 62 10 52 V24 Q10 14 18 14 Z M50 4 V12" },
  { id: "bathtub", name: "Bathtub", group: "Bath", vb: [170, 75], size: [1.7, 0.75], d: "M0 0 H170 V75 H0 Z M8 8 H138 Q162 8 162 37.5 Q162 67 138 67 H8 Z M24 37.5 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0" },
  { id: "shower", name: "Shower", group: "Bath", vb: [100, 100], size: [0.9, 0.9], d: "M0 0 H100 V100 H0 Z M0 0 L100 100 M100 0 L0 100 " + circle(50, 50, 6) },
  { id: "counter", name: "Counter with hob", group: "Kitchen", vb: [240, 60], size: [2.4, 0.6], d: "M0 0 H240 V60 H0 Z " + [circle(150, 18, 9), circle(178, 18, 9), circle(150, 44, 9), circle(178, 44, 9)].join(" ") + " M20 10 H90 V50 H20 Z M55 4 V10" },
  { id: "fridge", name: "Fridge", group: "Kitchen", vb: [60, 65], size: [0.6, 0.65], d: "M0 0 H60 V65 H0 Z M0 10 H60 M10 0 L50 10 M50 0 L10 10" },
  { id: "bed-double", name: "Double bed", group: "Furniture", vb: [160, 200], size: [1.6, 2.0], d: "M0 0 H160 V200 H0 Z M10 8 H74 V40 H10 Z M86 8 H150 V40 H86 Z M0 52 H160" },
  { id: "bed-single", name: "Single bed", group: "Furniture", vb: [90, 200], size: [0.9, 2.0], d: "M0 0 H90 V200 H0 Z M12 8 H78 V40 H12 Z M0 52 H90" },
  { id: "sofa", name: "Sofa", group: "Furniture", vb: [200, 90], size: [2.0, 0.9], d: "M0 0 H200 V90 H0 Z M0 25 H200 M20 25 V90 M180 25 V90 M100 25 V90" },
  { id: "armchair", name: "Armchair", group: "Furniture", vb: [90, 90], size: [0.85, 0.85], d: "M0 0 H90 V90 H0 Z M0 25 H90 M18 25 V90 M72 25 V90" },
  { id: "dining", name: "Table & 4 chairs", group: "Furniture", vb: [160, 160], size: [1.6, 1.6], d: "M40 30 H120 V130 H40 Z M10 45 H32 V70 H10 Z M10 90 H32 V115 H10 Z M128 45 H150 V70 H128 Z M128 90 H150 V115 H128 Z" },
  { id: "desk", name: "Desk & chair", group: "Furniture", vb: [140, 120], size: [1.4, 1.2], d: "M0 0 H140 V60 H0 Z M50 72 H90 V114 H50 Z M50 72 Q70 66 90 72" },
  { id: "wardrobe", name: "Wardrobe", group: "Furniture", vb: [120, 60], size: [1.2, 0.6], d: "M0 0 H120 V60 H0 Z M60 0 V60 M8 30 H52 M68 30 H112" },
  { id: "tree", name: "Tree", group: "Site", vb: [100, 100], size: [4, 4], d: `${circle(50, 50, 48)} ${circle(50, 50, 30)} M50 38 V62 M38 50 H62` },
  { id: "car", name: "Car", group: "Site", vb: [180, 450], size: [1.8, 4.5], d: "M20 0 H160 Q180 0 180 30 V420 Q180 450 160 450 H20 Q0 450 0 420 V30 Q0 0 20 0 Z M15 110 Q90 80 165 110 L155 170 H25 Z M25 330 H155 L165 380 Q90 400 15 380 Z" },
  { id: "parking", name: "Parking bay", group: "Site", vb: [250, 500], size: [2.5, 5.0], d: "M0 500 V0 H250 V500" },
  { id: "north", name: "North arrow", group: "Annotation", vb: [60, 100], size: [1.2, 2.0], d: "M30 0 L58 95 L30 78 Z", fill: "#111827" },
  { id: "north-outline", name: "North arrow (outline)", group: "Annotation", vb: [60, 100], size: [1.2, 2.0], d: "M30 0 L58 95 L30 78 L2 95 Z M30 0 V78" },
  { id: "section", name: "Section marker", group: "Annotation", vb: [120, 60], size: [1.6, 0.8], d: `${circle(30, 30, 28)} M2 30 H58 M58 30 H120 M106 22 L120 30 L106 38` },
  { id: "level", name: "Level marker", group: "Annotation", vb: [120, 40], size: [1.6, 0.55], d: "M0 0 H40 L20 34 Z M40 0 H120", fill: "#111827" },
];

export const SYMBOL_BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));
