// Board element model. Elements live in a Y.Map<BoardElement> named "elements" inside the board's Y.Doc.

export type ElementType =
  | "sticky"
  | "rect"
  | "ellipse"
  | "diamond"
  | "text"
  | "connector"
  | "pen"
  | "image"
  | "frame";

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number; // stacking order
  fill: string;
  stroke: string;
  text?: string;
  fontSize?: number;
  locked?: boolean;
}

export interface ConnectorElement extends BaseElement {
  type: "connector";
  // Endpoints: either attached to another element or a free point (world coords).
  from: { id?: string; x: number; y: number };
  to: { id?: string; x: number; y: number };
  arrowEnd: boolean;
  arrowStart: boolean;
}

export interface PenElement extends BaseElement {
  type: "pen";
  points: number[]; // relative to x,y
  strokeWidth: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
}

export type BoardElement = BaseElement | ConnectorElement | PenElement | ImageElement;

export const STICKY_COLORS = ["#fde68a", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#ddd6fe", "#fed7aa", "#e5e7eb"];
export const SHAPE_COLORS = ["#ffffff", "#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#111827"];

let counter = 0;
export function newId() {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${counter.toString(36)}`;
}

export function makeElement(type: ElementType, x: number, y: number, extra: Partial<BoardElement> = {}): BoardElement {
  const base: BaseElement = {
    id: newId(),
    type,
    x,
    y,
    width: 160,
    height: 160,
    rotation: 0,
    z: Date.now(),
    fill: "#ffffff",
    stroke: "#1f2937",
  };
  switch (type) {
    case "sticky":
      return { ...base, width: 180, height: 180, fill: STICKY_COLORS[0], stroke: "transparent", text: "", fontSize: 18, ...extra } as BaseElement;
    case "rect":
    case "ellipse":
    case "diamond":
      return { ...base, width: 180, height: 120, fill: "#ffffff", stroke: "#1f2937", text: "", fontSize: 16, ...extra } as BaseElement;
    case "text":
      return { ...base, width: 240, height: 40, fill: "transparent", stroke: "#111827", text: "Text", fontSize: 24, ...extra } as BaseElement;
    case "frame":
      return { ...base, width: 800, height: 520, fill: "#ffffff", stroke: "#cbd5e1", text: "Frame", z: 0, ...extra } as BaseElement;
    default:
      return { ...base, ...extra } as BaseElement;
  }
}
