"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Arrow, Transformer, Line, Group, Circle, Text as KText } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  makeElement,
  type BoardElement,
  type ConnectorElement,
  type ElementType,
  type PenElement,
  type MeasureElement,
  type SymbolElement,
  hasPoints,
} from "@/lib/board/types";
import { ElementNode } from "./ElementNode";
import {
  DEFAULT_PX_PER_METER, formatArea, formatLength, metersPerPxAt, polygonArea, polylineLength, snapAngle, SYMBOL_BY_ID,
  type BoardScale, type Unit,
} from "@/lib/board/arch";
import type { BoardApi, Peer } from "./useBoard";
import {
  bounds,
  clampScale,
  connectorPoints,
  contains,
  hitElement,
  intersects,
  normRect,
  unionRect,
  type Camera,
  type Rect as R,
} from "./geometry";

export type Tool =
  | "select" | "hand" | "sticky" | "text" | "rect" | "ellipse" | "diamond" | "connector" | "pen" | "frame" | "comment"
  // architecture
  | "measure" | "area" | "wall" | "cloud" | "highlighter" | "calibrate" | "symbol";

export type CanvasHandle = {
  zoomBy: (factor: number) => void;
  zoomTo: (scale: number) => void;
  fitContent: () => void;
  /** Camera that fits a world rect on screen (used for presenting frames). */
  cameraFor: (r: R, pad?: number) => Camera;
  size: () => { width: number; height: number };
  viewportCenter: () => { x: number; y: number };
  exportPng: () => string | null;
};

type Props = {
  elements: BoardElement[];
  api: BoardApi;
  peers: Peer[];
  canEdit: boolean;
  tool: Tool;
  setTool: (t: Tool) => void;
  selection: string[];
  setSelection: (ids: string[]) => void;
  camera: Camera;
  setCamera: (c: Camera | ((c: Camera) => Camera)) => void;
  penColor: string;
  /** Architecture: board fallback scale, display unit, symbol being placed, calibrate callback. */
  boardScale?: BoardScale;
  unit?: Unit;
  placingSymbol?: string | null;
  onCalibrate?: (line: { x1: number; y1: number; x2: number; y2: number }) => void;
  onComment: (p: { x: number; y: number }) => void;
  overlay?: React.ReactNode;
  /** Called when the user pans or zooms by hand (stops following someone). */
  onManualCamera?: () => void;
  /** While a vote is open, clicking an element casts a vote instead of selecting it. */
  onVote?: (id: string) => void;
  badges?: Map<string, { count: number; mine: number }>;
  hiddenIds?: Set<string>;
  /** Hide all chrome-like affordances (selection, transformer) e.g. while presenting. */
  presenting?: boolean;
};

const SHAPE_TOOLS: Partial<Record<Tool, ElementType>> = { rect: "rect", ellipse: "ellipse", diamond: "diamond", frame: "frame" };
const TEXT_TYPES = new Set<ElementType>(["sticky", "rect", "ellipse", "diamond", "text", "frame", "cloud"]);

type Gesture =
  | { kind: "pan"; startX: number; startY: number; cam: Camera }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { kind: "shape"; type: ElementType; x0: number; y0: number; x1: number; y1: number }
  | { kind: "connector"; fromId?: string; x0: number; y0: number; x1: number; y1: number }
  | { kind: "pen"; points: number[]; highlight?: boolean }
  | { kind: "line"; purpose: "measure" | "wall" | "calibrate"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "area"; points: number[]; cx: number; cy: number };

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(props, ref) {
  const { elements, api, peers, canEdit, tool, setTool, selection, setSelection, camera, setCamera, penColor, onComment, overlay,
    onManualCamera, onVote, badges, hiddenIds, presenting, boardScale = null, unit = "m", placingSymbol, onCalibrate } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const shiftDown = useRef(false);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { shiftDown.current = e.shiftKey; };
    window.addEventListener("keydown", f);
    window.addEventListener("keyup", f);
    return () => { window.removeEventListener("keydown", f); window.removeEventListener("keyup", f); };
  }, []);
  const dragState = useRef<{ start: Map<string, { x: number; y: number }>; children: Map<string, string[]> } | null>(null);

  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const editing = editingId ? byId.get(editingId) : undefined;

  // ── Sizing ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── Transformer follows selection ─────────────────────────────────────────
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selection
      .filter((id) => {
        const e = byId.get(id);
        return e && e.type !== "connector" && !e.locked && id !== editingId;
      })
      .map((id) => stage.findOne(`#${id}`))
      .filter(Boolean) as Konva.Node[];
    tr.nodes(canEdit && !presenting && !onVote ? nodes : []);
    tr.getLayer()?.batchDraw();
  }, [selection, byId, canEdit, editingId, presenting, onVote]);

  const toWorld = useCallback(
    (sx: number, sy: number) => ({ x: (sx - camera.x) / camera.scale, y: (sy - camera.y) / camera.scale }),
    [camera],
  );
  const pointerWorld = () => {
    const p = stageRef.current?.getPointerPosition();
    return p ? toWorld(p.x, p.y) : null;
  };

  // ── Camera controls ───────────────────────────────────────────────────────
  const zoomAround = useCallback(
    (factor: number, sx: number, sy: number) => {
      setCamera((c) => {
        const scale = clampScale(c.scale * factor);
        const wx = (sx - c.x) / c.scale, wy = (sy - c.y) / c.scale;
        return { scale, x: sx - wx * scale, y: sy - wy * scale };
      });
    },
    [setCamera],
  );

  // Read the container directly: the size state lags one render behind on first mount.
  const liveSize = () => {
    const el = containerRef.current;
    return el && el.clientWidth ? { width: el.clientWidth, height: el.clientHeight } : size;
  };

  useImperativeHandle(ref, () => ({
    zoomBy: (f) => zoomAround(f, size.width / 2, size.height / 2),
    zoomTo: (s) => zoomAround(s / camera.scale, size.width / 2, size.height / 2),
    fitContent: () => {
      const size = liveSize();
      const b = unionRect(elements.map(bounds));
      if (!b) return setCamera({ x: size.width / 2, y: size.height / 2, scale: 1 });
      // Leave room for the toolbar (left) and top bar, and for frame titles drawn above frames.
      const padX = 90, padTop = 100, padBottom = 70;
      const bb = { ...b, y: b.y - 30, height: b.height + 30 };
      const scale = clampScale(Math.min((size.width - padX * 2) / Math.max(bb.width, 1), (size.height - padTop - padBottom) / Math.max(bb.height, 1), 1.5));
      setCamera({ scale, x: size.width / 2 - (bb.x + bb.width / 2) * scale, y: padTop + (size.height - padTop - padBottom) / 2 - (bb.y + bb.height / 2) * scale });
    },
    cameraFor: (r, pad = 60) => {
      const size = liveSize();
      const scale = clampScale(Math.min((size.width - pad * 2) / Math.max(r.width, 1), (size.height - pad * 2) / Math.max(r.height, 1)));
      return { scale, x: size.width / 2 - (r.x + r.width / 2) * scale, y: size.height / 2 - (r.y + r.height / 2) * scale };
    },
    size: () => liveSize(),
    viewportCenter: () => { const size = liveSize(); return toWorld(size.width / 2, size.height / 2); },
    exportPng: () => {
      const stage = stageRef.current;
      const b = unionRect(elements.map(bounds));
      if (!stage || !b) return null;
      trRef.current?.nodes([]);
      const pad = 40;
      const url = stage.toDataURL({
        x: (b.x - pad) * camera.scale + camera.x,
        y: (b.y - pad - 30) * camera.scale + camera.y,
        width: (b.width + pad * 2) * camera.scale,
        height: (b.height + pad * 2 + 30) * camera.scale,
        pixelRatio: Math.min(4, 2 / camera.scale),
      });
      return url;
    },
  }), [zoomAround, size, camera, elements, setCamera, toWorld]);

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    onManualCamera?.();
    if (e.evt.ctrlKey || e.evt.metaKey) {
      zoomAround(Math.exp(-e.evt.deltaY * 0.01), p.x, p.y);
    } else {
      setCamera((c) => ({ ...c, x: c.x - e.evt.deltaX, y: c.y - e.evt.deltaY }));
    }
  };

  // ── Keyboard ─────────────────────────────────────────────────────────────
  const clipboard = useRef<BoardElement[]>([]);
  useEffect(() => {
    const isTyping = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a as HTMLElement | null)?.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") { setSpaceDown(true); e.preventDefault(); return; }
      if (e.key === "Escape") { setGesture(null); setSelection([]); setTool("select"); return; }
      if (e.key === "Enter") { finishAreaRef.current(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelection(elements.map((x) => x.id)); return; }
      if (!canEdit) return;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) api.redo(); else api.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); api.redo(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selection.length) { e.preventDefault(); api.remove(selection); setSelection([]); return; }
      if (mod && e.key.toLowerCase() === "c") { clipboard.current = selection.map((id) => byId.get(id)!).filter(Boolean); return; }
      if (mod && (e.key.toLowerCase() === "v" || e.key.toLowerCase() === "d")) {
        const src = e.key.toLowerCase() === "d" ? selection.map((id) => byId.get(id)!).filter(Boolean) : clipboard.current;
        if (!src.length) return;
        e.preventDefault();
        const copies = duplicate(src);
        api.add(copies);
        setSelection(copies.map((c) => c.id));
        return;
      }
      if (e.key.startsWith("Arrow") && selection.length) {
        e.preventDefault();
        const d = e.shiftKey ? 20 : 2;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        api.updateMany(selection.map((id) => byId.get(id)).filter((x): x is BoardElement => !!x && x.type !== "connector")
          .map((x) => ({ id: x.id, patch: { x: x.x + dx, y: x.y + dy } })));
        return;
      }
      if (mod || e.altKey) return;
      const shortcuts: Record<string, Tool> = {
        v: "select", h: "hand", n: "sticky", t: "text", r: "rect", o: "ellipse", l: "connector", p: "pen", f: "frame", c: "comment",
        m: "measure", a: "area", w: "wall", k: "calibrate", q: "cloud", i: "highlighter",
      };
      const t = shortcuts[e.key.toLowerCase()];
      if (t) setTool(t);
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [api, byId, canEdit, elements, selection, setSelection, setTool]);

  // ── Pointer handling ─────────────────────────────────────────────────────
  const elementIdFromTarget = (t: Konva.Node): string | null => {
    let n: Konva.Node | null = t;
    while (n && n !== stageRef.current) {
      if (n.name() === "element" || n.name() === "connector") return n.id();
      n = n.getParent();
    }
    return null;
  };

  const minZ = () => elements.reduce((m, e) => Math.min(m, e.z), 0);

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const p = pointerWorld();
    const sp = stageRef.current?.getPointerPosition();
    if (!p || !sp) return;
    if (editingId) commitEdit();
    const isTransformerPart = e.target.getParent()?.className === "Transformer";
    if (isTransformerPart) return;

    if (tool === "hand" || spaceDown || e.evt.button === 1) {
      onManualCamera?.();
      setGesture({ kind: "pan", startX: sp.x, startY: sp.y, cam: camera });
      return;
    }
    if (onVote) {
      const id = elementIdFromTarget(e.target);
      const el = id ? byId.get(id) : undefined;
      if (el && el.type !== "connector" && el.type !== "frame") { onVote(el.id); return; }
      // Clicking empty space while voting pans the board.
      onManualCamera?.();
      setGesture({ kind: "pan", startX: sp.x, startY: sp.y, cam: camera });
      return;
    }
    if (tool === "comment") { onComment(p); setTool("select"); return; }

    if (tool === "select" || !canEdit) {
      const id = elementIdFromTarget(e.target);
      if (id) {
        if (e.evt.shiftKey) setSelection(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]);
        else if (!selection.includes(id)) setSelection([id]);
        return;
      }
      if (!e.evt.shiftKey) setSelection([]);
      setGesture({ kind: "marquee", x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: e.evt.shiftKey });
      return;
    }

    if (tool === "sticky" || tool === "text") {
      const el = makeElement(tool, 0, 0);
      el.x = p.x - el.width / 2;
      el.y = p.y - el.height / 2;
      api.add([el]);
      setSelection([el.id]);
      setTool("select");
      setEditingId(el.id);
      return;
    }
    const shapeType = SHAPE_TOOLS[tool];
    if (shapeType) { setGesture({ kind: "shape", type: shapeType, x0: p.x, y0: p.y, x1: p.x, y1: p.y }); return; }
    if (tool === "connector") {
      const hit = hitElement(elements, p);
      setGesture({ kind: "connector", fromId: hit?.id, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    if (tool === "pen" || tool === "highlighter") { setGesture({ kind: "pen", points: [p.x, p.y], highlight: tool === "highlighter" }); return; }
    if (tool === "measure" || tool === "wall" || tool === "calibrate") {
      setGesture({ kind: "line", purpose: tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    if (tool === "cloud") { setGesture({ kind: "shape", type: "cloud", x0: p.x, y0: p.y, x1: p.x, y1: p.y }); return; }
    if (tool === "area") {
      if (gesture?.kind !== "area") { setGesture({ kind: "area", points: [p.x, p.y], cx: p.x, cy: p.y }); return; }
      const [fx, fy] = gesture.points;
      if (gesture.points.length >= 6 && Math.hypot(p.x - fx, p.y - fy) < 10 / camera.scale) { finishArea(); return; }
      const lx = gesture.points[gesture.points.length - 2], ly = gesture.points[gesture.points.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) > 2 / camera.scale) setGesture({ ...gesture, points: [...gesture.points, p.x, p.y] });
      return;
    }
    if (tool === "symbol" && placingSymbol) {
      const def = SYMBOL_BY_ID.get(placingSymbol);
      if (!def) return;
      const k = metersPerPxAt(elements, p, boardScale);
      const pxPerM = k ? 1 / k : DEFAULT_PX_PER_METER;
      const w = def.size[0] * pxPerM, h = def.size[1] * pxPerM;
      const el = makeElement("symbol", p.x - w / 2, p.y - h / 2, { width: w, height: h, fill: "#ffffff", stroke: "#111827" }) as SymbolElement;
      el.symbol = def.id;
      api.add([el]);
      setSelection([el.id]);
      setTool("select");
      return;
    }
  };

  const lastCursor = useRef(0);
  const onPointerMove = () => {
    const p = pointerWorld();
    const sp = stageRef.current?.getPointerPosition();
    if (!p || !sp) return;
    const now = performance.now();
    if (now - lastCursor.current > 40) { lastCursor.current = now; api.setCursor(p); }
    if (!gesture) return;
    switch (gesture.kind) {
      case "pan":
        setCamera({ ...gesture.cam, x: gesture.cam.x + sp.x - gesture.startX, y: gesture.cam.y + sp.y - gesture.startY });
        break;
      case "marquee":
      case "shape":
      case "connector":
        setGesture({ ...gesture, x1: p.x, y1: p.y });
        break;
      case "pen":
        setGesture({ ...gesture, points: [...gesture.points, p.x, p.y] });
        break;
      case "line": {
        const q = shiftDown.current ? snapAngle(gesture.x0, gesture.y0, p.x, p.y) : p;
        setGesture({ ...gesture, x1: q.x, y1: q.y });
        break;
      }
      case "area":
        setGesture({ ...gesture, cx: p.x, cy: p.y });
        break;
    }
  };

  const onPointerUp = () => {
    const g = gesture;
    if (g?.kind === "area") return; // areas are finished with a double-click, Enter, or by clicking the first point
    setGesture(null);
    if (!g) return;
    if (g.kind === "line") {
      const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
      if (len < 5 / camera.scale) return;
      if (g.purpose === "calibrate") { onCalibrate?.({ x1: g.x0, y1: g.y0, x2: g.x1, y2: g.y1 }); setTool("select"); return; }
      if (g.purpose === "measure") {
        const x = Math.min(g.x0, g.x1), y = Math.min(g.y0, g.y1);
        const el = makeElement("dimension", x, y, {
          width: Math.max(1, Math.abs(g.x1 - g.x0)), height: Math.max(1, Math.abs(g.y1 - g.y0)), fill: "transparent", stroke: "#be123c",
        }) as MeasureElement;
        el.points = [g.x0 - x, g.y0 - y, g.x1 - x, g.y1 - y];
        api.add([el]);
        return;
      }
      // Wall: a rotated rect whose centerline runs from the start to the end point; 20 cm thick at plan scale.
      const k = metersPerPxAt(elements, { x: (g.x0 + g.x1) / 2, y: (g.y0 + g.y1) / 2 }, boardScale);
      const t = k ? 0.2 / k : 10;
      const a = Math.atan2(g.y1 - g.y0, g.x1 - g.x0);
      const el = makeElement("wall", g.x0 + Math.sin(a) * t / 2, g.y0 - Math.cos(a) * t / 2, {
        width: len, height: t, rotation: (a * 180) / Math.PI, fill: "#374151", stroke: "#1f2937",
      });
      api.add([el]);
      return;
    }
    if (g.kind === "marquee") {
      const r = normRect(g.x0, g.y0, g.x1, g.y1);
      if (r.width < 3 && r.height < 3) return;
      const hits = elements.filter((el) => {
        if (el.type === "connector" || el.locked) return false;
        const b = bounds(el);
        return el.type === "frame" ? contains(r, b) : intersects(r, b);
      }).map((el) => el.id);
      setSelection(g.additive ? Array.from(new Set([...selection, ...hits])) : hits);
    } else if (g.kind === "shape") {
      let r = normRect(g.x0, g.y0, g.x1, g.y1);
      const el = makeElement(g.type, 0, 0);
      if (r.width < 8 && r.height < 8) r = { x: g.x0 - el.width / 2, y: g.y0 - el.height / 2, width: el.width, height: el.height };
      Object.assign(el, r);
      if (g.type === "frame") el.z = minZ() - 1;
      if (g.type === "cloud") Object.assign(el, { fill: "transparent", stroke: "#dc2626", fontSize: 16, text: "" });
      api.add([el]);
      setSelection([el.id]);
      setTool("select");
    } else if (g.kind === "connector") {
      const to = hitElement(elements, { x: g.x1, y: g.y1 }, g.fromId);
      if (Math.hypot(g.x1 - g.x0, g.y1 - g.y0) < 10 && !to) return;
      const c = makeElement("connector", 0, 0) as ConnectorElement;
      Object.assign(c, {
        width: 0, height: 0, stroke: penColor === "#ffffff" ? "#334155" : penColor,
        from: { id: g.fromId, x: g.x0, y: g.y0 },
        to: { id: to?.id, x: g.x1, y: g.y1 },
        arrowEnd: true, arrowStart: false,
      });
      api.add([c]);
      setSelection([c.id]);
    } else if (g.kind === "pen") {
      if (g.points.length < 4) return;
      const xs = g.points.filter((_, i) => i % 2 === 0), ys = g.points.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs), y = Math.min(...ys);
      const el = makeElement("pen", x, y) as PenElement;
      Object.assign(el, {
        width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y),
        points: g.points.map((v, i) => (i % 2 === 0 ? v - x : v - y)),
        stroke: g.highlight ? (penColor === "#111827" ? "#facc15" : penColor) : penColor,
        strokeWidth: g.highlight ? 18 : 3, opacity: g.highlight ? 0.35 : 1, fill: "transparent",
      });
      api.add([el]);
    }
  };

  function finishArea() {
    const g = gesture;
    if (g?.kind !== "area") return;
    setGesture(null);
    // Drop near-duplicate points (a double-click adds the last point twice).
    const pts: number[] = [];
    for (let i = 0; i < g.points.length; i += 2) {
      const n = pts.length;
      if (n && Math.hypot(g.points[i] - pts[n - 2], g.points[i + 1] - pts[n - 1]) < 3 / camera.scale) continue;
      pts.push(g.points[i], g.points[i + 1]);
    }
    if (pts.length < 6) return;
    const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
    const x = Math.min(...xs), y = Math.min(...ys);
    const el = makeElement("area", x, y, {
      width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y),
      fill: "rgba(20,163,139,0.14)", stroke: "#0f766e",
    }) as MeasureElement;
    el.points = pts.map((v, i) => (i % 2 === 0 ? v - x : v - y));
    api.add([el]);
  }

  const finishAreaRef = useRef(finishArea);
  finishAreaRef.current = finishArea;

  /** Text shown on dimension and area elements, using the plan scale under them. */
  const measureLabel = (el: BoardElement): string | undefined => {
    if (el.type !== "dimension" && el.type !== "area") return undefined;
    const m = el as MeasureElement;
    const k = metersPerPxAt(elements, { x: el.x + el.width / 2, y: el.y + el.height / 2 }, boardScale);
    if (el.type === "dimension") {
      const len = polylineLength(m.points);
      return k ? formatLength(len * k, unit) : `${Math.round(len)} px (no scale)`;
    }
    const a = polygonArea(m.points), per = polylineLength(m.points, true);
    return k ? `${formatArea(a * k * k, unit)}\nP ${formatLength(per * k, unit)}` : `${Math.round(a)} px² (no scale)`;
  };
  const livePreview = (x0: number, y0: number, x1: number, y1: number) => {
    const k = metersPerPxAt(elements, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, boardScale);
    const len = Math.hypot(x1 - x0, y1 - y0);
    return k ? formatLength(len * k, unit) : `${Math.round(len)} px`;
  };

  // ── Drag & transform ─────────────────────────────────────────────────────
  const onDragStart = (id: string) => {
    if (!dragState.current) dragState.current = { start: new Map(), children: new Map() };
    const ds = dragState.current;
    const el = byId.get(id);
    if (!el) return;
    ds.start.set(id, { x: el.x, y: el.y });
    if (el.type === "frame") {
      const fb = bounds(el);
      const kids = elements.filter((o) => o.id !== id && o.type !== "connector" && o.type !== "frame" && !selection.includes(o.id) && contains(fb, bounds(o)));
      ds.children.set(id, kids.map((k) => k.id));
      kids.forEach((k) => ds.start.set(k.id, { x: k.x, y: k.y }));
    }
  };

  const onDragMove = (id: string) => {
    const ds = dragState.current;
    const kids = ds?.children.get(id);
    if (!ds || !kids?.length) return;
    const node = stageRef.current?.findOne(`#${id}`);
    const s = ds.start.get(id);
    if (!node || !s) return;
    const dx = node.x() - s.x, dy = node.y() - s.y;
    for (const k of kids) {
      const kn = stageRef.current?.findOne(`#${k}`);
      const ks = ds.start.get(k);
      if (kn && ks) kn.position({ x: ks.x + dx, y: ks.y + dy });
    }
  };

  const onDragEnd = (id: string) => {
    const stage = stageRef.current;
    const ds = dragState.current;
    const node = stage?.findOne(`#${id}`);
    if (!node) return;
    const patches = [{ id, patch: { x: node.x(), y: node.y() } }];
    for (const k of ds?.children.get(id) ?? []) {
      const kn = stage?.findOne(`#${k}`);
      if (kn) patches.push({ id: k, patch: { x: kn.x(), y: kn.y() } });
    }
    api.updateMany(patches);
    ds?.children.delete(id);
    ds?.start.delete(id);
    if (ds && ds.start.size === 0) dragState.current = null;
    // Konva fires dragend for every node in a multi-selection; clear state once the last one ends.
    queueMicrotask(() => { if (dragState.current && !stage?.isDragging?.()) dragState.current = null; });
  };

  const onTransformEnd = (id: string) => {
    const node = stageRef.current?.findOne(`#${id}`);
    const el = byId.get(id);
    if (!node || !el) return;
    const sx = node.scaleX(), sy = node.scaleY();
    node.scale({ x: 1, y: 1 });
    const patch: Partial<BoardElement> & { points?: number[] } = {
      x: node.x(), y: node.y(), rotation: node.rotation(),
      width: Math.max(20, el.width * sx), height: Math.max(20, el.height * sy),
    };
    if (hasPoints(el)) patch.points = el.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy));
    if (el.type === "text" || el.type === "sticky") patch.fontSize = Math.max(8, Math.round((el.fontSize ?? 16) * (el.type === "text" ? sy : 1)));
    api.update(id, patch);
  };

  // ── Text editing ─────────────────────────────────────────────────────────
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const startEdit = (id: string) => {
    const el = byId.get(id);
    if (!canEdit || !el || !TEXT_TYPES.has(el.type) || hiddenIds?.has(id) || onVote) return;
    setEditingId(id);
  };
  useEffect(() => {
    if (!editingId) return;
    setDraft(byId.get(editingId)?.text ?? "");
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.select(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const commitEdit = () => {
    const el = editingId ? byId.get(editingId) : undefined;
    setEditingId(null);
    if (!el) return;
    const patch: Partial<BoardElement> = { text: draft };
    if (el.type === "text") {
      const ta = textareaRef.current;
      if (ta) patch.height = Math.max(el.fontSize ?? 24, ta.scrollHeight / camera.scale);
      if (!draft.trim()) { api.remove([el.id]); return; }
    }
    api.update(el.id, patch);
  };

  const editorStyle = (): React.CSSProperties | undefined => {
    if (!editing) return undefined;
    const s = camera.scale;
    const isFrame = editing.type === "frame";
    const pad = (editing.type === "sticky" ? 16 : editing.type === "text" ? 0 : 10) * s;
    return {
      position: "absolute",
      left: editing.x * s + camera.x,
      top: (isFrame ? editing.y - 28 : editing.y) * s + camera.y,
      width: (isFrame ? Math.min(editing.width, 320) : editing.width) * s,
      height: isFrame ? 26 * s : editing.type === "text" ? undefined : editing.height * s,
      minHeight: editing.type === "text" ? (editing.fontSize ?? 24) * 1.3 * s : undefined,
      padding: pad,
      fontSize: (isFrame ? 15 : editing.fontSize ?? 16) * s,
      lineHeight: 1.25,
      textAlign: editing.type === "text" || isFrame ? "left" : "center",
      background: editing.type === "text" || isFrame ? "rgba(255,255,255,0.9)" : editing.fill,
      color: editing.type === "text" ? editing.stroke : "#111827",
      transform: `rotate(${editing.rotation}deg)`,
      transformOrigin: "top left",
    };
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const cursor = tool === "hand" || spaceDown ? (gesture?.kind === "pan" ? "grabbing" : "grab") : tool === "select" ? "default" : "crosshair";
  const s = camera.scale;
  const gridSize = 24 * s;
  const peerSel = peers.flatMap((p) => (p.selection ?? []).map((id) => ({ id, color: p.color })));

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        cursor,
        backgroundColor: "#f8fafc",
        backgroundImage: s > 0.25 ? "radial-gradient(#cbd5e1 1px, transparent 1px)" : undefined,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
      onPointerLeave={() => api.setCursor(null)}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={camera.x}
        y={camera.y}
        scaleX={s}
        scaleY={s}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDblClick={() => { if (gesture?.kind === "area") finishArea(); }}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer>
          {elements.map((el) => {
            if (el.type === "connector") {
              const c = el as ConnectorElement;
              const pts = connectorPoints(c, byId);
              const sel = selection.includes(c.id);
              return (
                <Arrow key={c.id} id={c.id} name="connector" points={pts} stroke={sel ? "#0f8573" : c.stroke} fill={sel ? "#0f8573" : c.stroke}
                  strokeWidth={2} hitStrokeWidth={16} pointerLength={12} pointerWidth={12}
                  pointerAtBeginning={c.arrowStart} pointerAtEnding={c.arrowEnd} lineCap="round" />
              );
            }
            return (
              <ElementNode key={el.id} el={el} measure={measureLabel(el)} zoom={s} selected={selection.includes(el.id)} editing={editingId === el.id && el.type !== "frame" ? true : editingId === el.id}
                draggable={canEdit && tool === "select" && !spaceDown && !el.locked && editingId !== el.id && !onVote && !presenting}
                hidden={hiddenIds?.has(el.id) ?? false}
                onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onTransformEnd={onTransformEnd} onDblClick={startEdit} />
            );
          })}
          <Transformer ref={trRef} rotateEnabled flipEnabled={false} anchorSize={9} borderStroke="#0f8573" anchorStroke="#0f8573" anchorCornerRadius={2}
            ignoreStroke boundBoxFunc={(o, n) => (n.width < 10 || n.height < 10 ? o : n)} />
        </Layer>
        <Layer listening={false}>
          {selection.map((id) => {
            const el = byId.get(id);
            if (!el || el.type === "connector" || (canEdit && !el.locked)) return null;
            return <Rect key={id} x={el.x - 4} y={el.y - 4} width={el.width + 8} height={el.height + 8} stroke="#0f8573" strokeWidth={1.5 / s} dash={[6 / s, 4 / s]} />;
          })}
          {peerSel.map(({ id, color }) => {
            const el = byId.get(id);
            if (!el || el.type === "connector") return null;
            return <Rect key={`${id}-${color}`} x={el.x - 6} y={el.y - 6} width={el.width + 12} height={el.height + 12} stroke={color} strokeWidth={2 / s} cornerRadius={4} />;
          })}
          {badges && Array.from(badges.entries()).map(([id, b]) => {
            const el = byId.get(id);
            if (!el || (!b.count && !b.mine)) return null;
            const r = 14 / s;
            return (
              <Group key={`vote-${id}`} x={el.x + el.width} y={el.y}>
                <Circle radius={r} fill={b.mine ? "#0f8573" : "#334155"} stroke="white" strokeWidth={2 / s} />
                <KText text={String(b.count || b.mine)} fontSize={13 / s} fontStyle="bold" fill="white" width={r * 2} height={r * 2} x={-r} y={-r} align="center" verticalAlign="middle" />
              </Group>
            );
          })}
          {gesture?.kind === "marquee" && (
            <Rect {...normRect(gesture.x0, gesture.y0, gesture.x1, gesture.y1)} fill="rgba(20,163,139,0.08)" stroke="#14a38b" strokeWidth={1 / s} />
          )}
          {gesture?.kind === "shape" && (
            <Rect {...normRect(gesture.x0, gesture.y0, gesture.x1, gesture.y1)} stroke="#0f8573" dash={[6 / s, 4 / s]} strokeWidth={1.5 / s}
              cornerRadius={gesture.type === "ellipse" ? 999 : 6} />
          )}
          {gesture?.kind === "connector" && (
            <Arrow points={[gesture.x0, gesture.y0, gesture.x1, gesture.y1]} stroke="#0f8573" fill="#0f8573" strokeWidth={2} dash={[8, 6]} />
          )}
          {gesture?.kind === "pen" && (
            <Line points={gesture.points} stroke={gesture.highlight ? (penColor === "#111827" ? "#facc15" : penColor) : penColor}
              strokeWidth={gesture.highlight ? 18 : 3} opacity={gesture.highlight ? 0.35 : 1} lineCap="round" lineJoin="round" tension={0.4} />
          )}
          {gesture?.kind === "line" && (
            <>
              <Line points={[gesture.x0, gesture.y0, gesture.x1, gesture.y1]}
                stroke={gesture.purpose === "wall" ? "#374151" : gesture.purpose === "calibrate" ? "#7c3aed" : "#be123c"}
                strokeWidth={gesture.purpose === "wall" ? 6 / s : 2 / s} dash={gesture.purpose === "wall" ? undefined : [6 / s, 4 / s]} />
              <KText x={gesture.x1 + 10 / s} y={gesture.y1 + 10 / s} text={livePreview(gesture.x0, gesture.y0, gesture.x1, gesture.y1)}
                fontSize={13 / s} fill="#111827" fontStyle="600" />
            </>
          )}
          {gesture?.kind === "area" && (
            <>
              <Line points={[...gesture.points, gesture.cx, gesture.cy]} closed fill="rgba(20,163,139,0.12)" stroke="#0f766e" strokeWidth={1.5 / s} dash={[6 / s, 4 / s]} />
              <Circle x={gesture.points[0]} y={gesture.points[1]} radius={5 / s} fill="#0f766e" />
              <KText x={gesture.cx + 12 / s} y={gesture.cy + 12 / s} fontSize={12 / s} fill="#0f766e"
                text={gesture.points.length >= 4 ? "Double-click, press Enter or click the first point to finish" : "Click to add corners"} />
            </>
          )}
          {tool === "connector" && gesture?.kind === "connector" && (() => {
            const hit = hitElement(elements, { x: gesture.x1, y: gesture.y1 }, gesture.fromId);
            return hit ? <Rect {...bounds(hit)} stroke="#14a38b" strokeWidth={2 / s} cornerRadius={6} /> : null;
          })()}
        </Layer>
      </Stage>

      {editing && (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey || editing.type === "frame"))) { e.preventDefault(); commitEdit(); }
          }}
          className="resize-none overflow-hidden rounded-sm border-2 border-brand-500 outline-none"
          style={editorStyle()}
        />
      )}

      {/* Remote cursors */}
      {peers.map((p) =>
        p.cursor ? (
          <div key={p.clientId} className="pointer-events-none absolute left-0 top-0 transition-transform duration-75"
            style={{ transform: `translate(${p.cursor.x * s + camera.x}px, ${p.cursor.y * s + camera.y}px)` }}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M1 1l6 15 2.2-6.2L16 7.6z" fill={p.color} stroke="white" strokeWidth="1.2" /></svg>
            <span className="ml-3 rounded-md px-1.5 py-0.5 text-xs font-medium text-white shadow" style={{ background: p.color }}>{p.name}</span>
          </div>
        ) : null,
      )}
      {overlay}
    </div>
  );
});

/** Copy elements with fresh ids, keeping connectors between copied elements attached to the copies. */
function duplicate(src: BoardElement[]): BoardElement[] {
  const idMap = new Map<string, string>();
  const offset = 24;
  const copies = src.map((e) => {
    const c = makeElement(e.type, 0, 0);
    idMap.set(e.id, c.id);
    return { ...e, id: c.id, x: e.x + offset, y: e.y + offset, z: e.type === "frame" ? e.z : Date.now() + Math.random() } as BoardElement;
  });
  return copies.map((c) => {
    if (c.type !== "connector") return c;
    const k = c as ConnectorElement;
    const remap = (end: ConnectorElement["from"]) => ({
      id: end.id ? idMap.get(end.id) : undefined,
      x: end.x + offset,
      y: end.y + offset,
    });
    return { ...k, from: remap(k.from), to: remap(k.to) };
  });
}

export type { R as WorldRect };
