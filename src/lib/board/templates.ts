import { makeElement, type BoardElement, type ConnectorElement } from "./types";

export type TemplateId = "blank" | "kanban" | "retro" | "brainstorm" | "flowchart";

export const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  { id: "blank", name: "Blank board", description: "Start from an empty canvas." },
  { id: "kanban", name: "Kanban", description: "To do, doing and done columns." },
  { id: "retro", name: "Retrospective", description: "Went well, to improve, action items." },
  { id: "brainstorm", name: "Brainstorm", description: "A central idea with branches." },
  { id: "flowchart", name: "Flowchart", description: "Start, steps, decision and end." },
];

function columns(titles: string[], colors: string[]): BoardElement[] {
  const out: BoardElement[] = [];
  titles.forEach((t, i) => {
    const x = i * 440;
    out.push(makeElement("frame", x, 0, { width: 400, height: 640, text: t, z: i }));
    out.push(makeElement("sticky", x + 30, 60, { fill: colors[i % colors.length], text: `Add a note to “${t}”`, z: 100 + i }));
  });
  return out;
}

function connector(a: BoardElement, b: BoardElement): ConnectorElement {
  const c = makeElement("connector", 0, 0) as ConnectorElement;
  return {
    ...c,
    stroke: "#334155",
    from: { id: a.id, x: a.x + a.width / 2, y: a.y + a.height / 2 },
    to: { id: b.id, x: b.x + b.width / 2, y: b.y + b.height / 2 },
    arrowEnd: true,
    arrowStart: false,
    z: 50,
  };
}

export function templateElements(id: TemplateId): BoardElement[] {
  switch (id) {
    case "kanban":
      return columns(["To do", "In progress", "Done"], ["#fde68a", "#bfdbfe", "#bbf7d0"]);
    case "retro":
      return columns(["Went well", "To improve", "Action items"], ["#bbf7d0", "#fbcfe8", "#ddd6fe"]);
    case "brainstorm": {
      const center = makeElement("ellipse", 300, 240, { width: 240, height: 140, fill: "#0f766e", stroke: "#0f766e", text: "Big idea", fontSize: 22 });
      const els: BoardElement[] = [center];
      const angles = [0, 72, 144, 216, 288];
      angles.forEach((deg, i) => {
        const r = (deg * Math.PI) / 180;
        const s = makeElement("sticky", 330 + Math.cos(r) * 380, 220 + Math.sin(r) * 280, {
          width: 160, height: 160, text: `Idea ${i + 1}`, fill: ["#fde68a", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#fed7aa"][i],
        });
        els.push(s, connector(center, s));
      });
      return els;
    }
    case "flowchart": {
      const start = makeElement("ellipse", 0, 0, { width: 160, height: 80, text: "Start", fill: "#ccfbf1" });
      const step = makeElement("rect", 0, 160, { width: 160, height: 90, text: "Do something" });
      const decide = makeElement("diamond", -10, 330, { width: 180, height: 140, text: "OK?", fill: "#fef3c7" });
      const end = makeElement("ellipse", 0, 550, { width: 160, height: 80, text: "End", fill: "#ccfbf1" });
      const fix = makeElement("rect", 300, 355, { width: 160, height: 90, text: "Fix it" });
      return [start, step, decide, end, fix, connector(start, step), connector(step, decide), connector(decide, end), connector(decide, fix), connector(fix, step)];
    }
    default:
      return [];
  }
}
