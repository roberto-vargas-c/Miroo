"use client";

import { useEffect, useState } from "react";
import { Group, Rect, Text, Ellipse, Line, Image as KImage } from "react-konva";
import type { BoardElement, ImageElement, PenElement } from "@/lib/board/types";

function useImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
    return () => { i.onload = null; };
  }, [src]);
  return img;
}

function ImageShape({ el }: { el: ImageElement }) {
  const img = useImage(el.src);
  return img ? (
    <KImage image={img} width={el.width} height={el.height} />
  ) : (
    <Rect width={el.width} height={el.height} fill="#f1f5f9" stroke="#cbd5e1" dash={[6, 6]} />
  );
}

function textColorFor(fill: string) {
  if (!fill.startsWith("#") || fill.length !== 7) return "#111827";
  const r = parseInt(fill.slice(1, 3), 16), g = parseInt(fill.slice(3, 5), 16), b = parseInt(fill.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#111827" : "#ffffff";
}

export function Label({ el, editing }: { el: BoardElement; editing: boolean }) {
  if (editing || !el.text) return null;
  const pad = el.type === "sticky" ? 16 : el.type === "diamond" ? el.width * 0.18 : 10;
  return (
    <Text
      text={el.text}
      x={pad}
      y={el.type === "text" ? 0 : pad}
      width={Math.max(1, el.width - pad * 2)}
      height={el.type === "text" ? undefined : Math.max(1, el.height - pad * 2)}
      fontSize={el.fontSize ?? 16}
      fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
      fill={el.type === "text" ? el.stroke : textColorFor(el.fill)}
      align={el.type === "text" ? "left" : "center"}
      verticalAlign={el.type === "text" ? "top" : "middle"}
      lineHeight={1.25}
      wrap="word"
      ellipsis={el.type !== "text"}
      listening={false}
    />
  );
}

type Props = {
  el: BoardElement;
  draggable: boolean;
  editing: boolean;
  selected: boolean;
  onDragStart: (id: string) => void;
  onDragMove: (id: string) => void;
  onDragEnd: (id: string) => void;
  onTransformEnd: (id: string) => void;
  onDblClick: (id: string) => void;
};

export function ElementNode({ el, draggable, editing, onDragStart, onDragMove, onDragEnd, onTransformEnd, onDblClick }: Props) {
  const common = {
    id: el.id,
    name: "element",
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    draggable,
    onDragStart: () => onDragStart(el.id),
    onDragMove: () => onDragMove(el.id),
    onDragEnd: () => onDragEnd(el.id),
    onTransformEnd: () => onTransformEnd(el.id),
    onDblClick: () => onDblClick(el.id),
    onDblTap: () => onDblClick(el.id),
  };

  switch (el.type) {
    case "sticky":
      return (
        <Group {...common}>
          <Rect width={el.width} height={el.height} fill={el.fill} cornerRadius={3}
            shadowColor="#0f172a" shadowOpacity={0.18} shadowBlur={12} shadowOffsetY={4} />
          <Label el={el} editing={editing} />
        </Group>
      );
    case "rect":
      return (
        <Group {...common}>
          <Rect width={el.width} height={el.height} fill={el.fill} stroke={el.stroke} strokeWidth={2} cornerRadius={8} />
          <Label el={el} editing={editing} />
        </Group>
      );
    case "ellipse":
      return (
        <Group {...common}>
          <Ellipse x={el.width / 2} y={el.height / 2} radiusX={el.width / 2} radiusY={el.height / 2} fill={el.fill} stroke={el.stroke} strokeWidth={2} />
          <Label el={el} editing={editing} />
        </Group>
      );
    case "diamond":
      return (
        <Group {...common}>
          <Line points={[el.width / 2, 0, el.width, el.height / 2, el.width / 2, el.height, 0, el.height / 2]} closed fill={el.fill} stroke={el.stroke} strokeWidth={2} lineJoin="round" />
          <Label el={el} editing={editing} />
        </Group>
      );
    case "text":
      return (
        <Group {...common}>
          <Rect width={el.width} height={el.height} fill="rgba(0,0,0,0)" />
          <Label el={el} editing={editing} />
        </Group>
      );
    case "frame":
      // Only the title bar is a hit target, so you can still click and marquee-select inside a frame.
      return (
        <Group {...common}>
          <Rect width={el.width} height={el.height} fill={el.fill} stroke={el.stroke} strokeWidth={1.5} cornerRadius={6} listening={false}
            shadowColor="#0f172a" shadowOpacity={0.06} shadowBlur={8} />
          <Rect y={-30} width={Math.min(el.width, Math.max(80, (el.text?.length ?? 5) * 9 + 24))} height={26} fill="rgba(0,0,0,0)" />
          {!editing && <Text y={-24} text={el.text || "Frame"} fontSize={15} fontStyle="600" fill="#475569" listening={false} />}
        </Group>
      );
    case "pen": {
      const p = el as PenElement;
      return (
        <Group {...common}>
          <Rect width={el.width} height={el.height} fill="rgba(0,0,0,0)" />
          <Line points={p.points} stroke={p.stroke} strokeWidth={p.strokeWidth} lineCap="round" lineJoin="round" tension={0.4} />
        </Group>
      );
    }
    case "image":
      return (
        <Group {...common}>
          <ImageShape el={el as ImageElement} />
        </Group>
      );
    default:
      return null;
  }
}
