// Extra diagram shapes, generated at the element's real size so strokes don't distort.
export type ShapeDef = { id: string; name: string; path: (w: number, h: number) => string };

function star(w: number, h: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.21;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(w / 2 + Math.cos(a) * r * w).toFixed(1)} ${(h / 2 + Math.sin(a) * r * h * 1.05 + h * 0.03).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

function polygon(n: number, w: number, h: number) {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push(`${(w / 2 + (Math.cos(a) * w) / 2).toFixed(1)} ${(h / 2 + (Math.sin(a) * h) / 2).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

export const SHAPES: ShapeDef[] = [
  { id: "triangle", name: "Triangle", path: (w, h) => `M${w / 2} 0 L${w} ${h} L0 ${h} Z` },
  { id: "hexagon", name: "Hexagon", path: (w, h) => `M${w * 0.25} 0 H${w * 0.75} L${w} ${h / 2} L${w * 0.75} ${h} H${w * 0.25} L0 ${h / 2} Z` },
  { id: "pentagon", name: "Pentagon", path: (w, h) => polygon(5, w, h) },
  { id: "parallelogram", name: "Parallelogram", path: (w, h) => `M${w * 0.2} 0 H${w} L${w * 0.8} ${h} H0 Z` },
  { id: "trapezoid", name: "Trapezoid", path: (w, h) => `M${w * 0.2} 0 H${w * 0.8} L${w} ${h} H0 Z` },
  {
    id: "cylinder", name: "Database", path: (w, h) => {
      const ry = Math.min(h * 0.15, 24);
      return `M0 ${ry} A${w / 2} ${ry} 0 0 1 ${w} ${ry} V${h - ry} A${w / 2} ${ry} 0 0 1 0 ${h - ry} Z M0 ${ry} A${w / 2} ${ry} 0 0 0 ${w} ${ry}`;
    },
  },
  { id: "star", name: "Star", path: star },
  { id: "arrow", name: "Block arrow", path: (w, h) => `M0 ${h * 0.3} H${w * 0.65} V0 L${w} ${h / 2} L${w * 0.65} ${h} V${h * 0.7} H0 Z` },
  { id: "chevron", name: "Chevron", path: (w, h) => `M0 0 H${w * 0.75} L${w} ${h / 2} L${w * 0.75} ${h} H0 L${w * 0.25} ${h / 2} Z` },
  { id: "callout", name: "Speech bubble", path: (w, h) => `M0 0 H${w} V${h * 0.75} H${w * 0.38} L${w * 0.15} ${h} L${w * 0.2} ${h * 0.75} H0 Z` },
  { id: "document", name: "Document", path: (w, h) => `M0 0 H${w} V${h * 0.85} Q${w * 0.75} ${h * 0.7} ${w / 2} ${h * 0.85} T0 ${h * 0.85} Z` },
  { id: "plus", name: "Cross", path: (w, h) => `M${w / 3} 0 H${(2 * w) / 3} V${h / 3} H${w} V${(2 * h) / 3} H${(2 * w) / 3} V${h} H${w / 3} V${(2 * h) / 3} H0 V${h / 3} H${w / 3} Z` },
];

export const SHAPE_BY_ID = new Map(SHAPES.map((s) => [s.id, s]));
