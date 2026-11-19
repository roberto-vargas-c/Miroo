"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Undo2, Redo2, ExternalLink, ChevronLeft, ChevronRight, Download, Maximize, MessageSquare, Minus, Plus, Share2, Presentation, Vote, Users, X } from "lucide-react";
import { makeElement, type BoardElement, type ImageElement, type EmbedElement } from "@/lib/board/types";
import { embedUrlFor, looksLikeUrl } from "./embeds";
import { PT_IN_METERS, formatLength, metersPerPxOfPlan, type Unit } from "@/lib/board/arch";
import { unionRect, bounds as elBounds } from "./geometry";
import { ArchToolbar } from "./ArchToolbar";
import { ScaleDialog } from "./ScaleDialog";
import { renameBoard } from "@/app/actions/workspace";
import { LogoMark } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { useBoard, type Viewport, type PrivateMode } from "./useBoard";
import { TimerWidget, VotePanel, PrivateModeButton, ReactionPicker, tallyVotes, type FloatingReaction } from "./Facilitation";
import type { CanvasHandle, Tool } from "./Canvas";
import type { Camera } from "./geometry";
import { Toolbar } from "./Toolbar";
import { PropertiesBar } from "./PropertiesBar";
import { ShareDialog, type Sharing } from "./ShareDialog";
import { CommentPanel, CommentPins, useComments } from "./Comments";

const Canvas = dynamic(() => import("./Canvas").then((m) => m.Canvas), { ssr: false });

export type BoardAppProps = {
  boardId: string;
  title: string;
  workspaceId: string | null;
  user: { id: string; name: string; color: string } | null;
  canEdit: boolean;
  canManage: boolean;
  shareToken: string | null;
  sharing: Sharing | null;
  teams: { id: string; name: string }[];
  realtimeUrl: string;
  /** Workspace members, for assigning task cards. */
  members: { id: string; name: string; color: string }[];
};

export function BoardApp(p: BoardAppProps) {
  const { elements, peers, status, synced, me, api: rawApi, session, votes } = useBoard(p.boardId, p.shareToken, p.realtimeUrl);
  const canEdit = p.canEdit && (me?.canEdit ?? p.canEdit);
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelectionState] = useState<string[]>([]);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [title, setTitle] = useState(p.title);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState<{ x: number; y: number } | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [penColor, setPenColor] = useState("#111827");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const comments = useComments(p.boardId, p.shareToken);

  // Private mode: tag notes created while it's on so others see them face-down until it ends.
  const privateOn = !!session.privateMode?.on;
  const api = useMemo(() => (privateOn && me
    ? { ...rawApi, add: (els: BoardElement[]) => rawApi.add(els.map((e) => ({ ...e, privateOwner: me.id }))) }
    : rawApi), [rawApi, privateOn, me]);
  const hiddenIds = useMemo(() => (privateOn
    ? new Set(elements.filter((e) => e.privateOwner && e.privateOwner !== me?.id).map((e) => e.id))
    : undefined), [privateOn, elements, me?.id]);
  const setPrivateMode = (m: PrivateMode) => {
    if (!m) {
      // Reveal: clear the private flag so turning the mode on again later doesn't re-hide old notes.
      api.updateMany(elements.filter((e) => e.privateOwner).map((e) => ({ id: e.id, patch: { privateOwner: "" } })));
    }
    api.setSession("privateMode", m);
  };

  const setSelection = useCallback((ids: string[]) => { setSelectionState(ids); rawApi.setSelection(ids); }, [rawApi]);

  // ── Camera animation ──
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const anim = useRef<number | null>(null);
  const flyTo = useCallback((target: Camera, ms = 450) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = cameraRef.current;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      // Interpolate zoom in log space so it feels even.
      const scale = Math.exp(Math.log(from.scale) + (Math.log(target.scale) - Math.log(from.scale)) * e);
      setCamera({ scale, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
      else anim.current = null;
    };
    anim.current = requestAnimationFrame(step);
  }, []);
  const screenSize = () => canvasRef.current?.size() ?? { width: window.innerWidth, height: window.innerHeight };
  const cameraForViewport = useCallback((vp: Viewport): Camera => {
    const sz = canvasRef.current?.size() ?? { width: window.innerWidth, height: window.innerHeight };
    return { scale: vp.scale, x: sz.width / 2 - vp.cx * vp.scale, y: sz.height / 2 - vp.cy * vp.scale };
  }, []);
  const myViewport = (): Viewport => {
    const sz = screenSize();
    return { cx: (sz.width / 2 - camera.x) / camera.scale, cy: (sz.height / 2 - camera.y) / camera.scale, scale: camera.scale };
  };

  // Broadcast my viewport (others use it to follow me).
  useEffect(() => {
    const t = setTimeout(() => {
      const sz = canvasRef.current?.size();
      if (sz) rawApi.setPresence("viewport", { cx: (sz.width / 2 - camera.x) / camera.scale, cy: (sz.height / 2 - camera.y) / camera.scale, scale: camera.scale });
    }, 60);
    return () => clearTimeout(t);
  }, [camera, rawApi]);

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Follow ──
  const [following, setFollowing] = useState<number | null>(null);
  const [optedOutOf, setOptedOutOf] = useState<number | null>(null);
  const followed = following === null ? undefined : peers.find((x) => x.clientId === following);
  useEffect(() => { if (following !== null && !followed) setFollowing(null); }, [following, followed]);
  const fvp = followed?.viewport;
  useEffect(() => { if (fvp) flyTo(cameraForViewport(fvp), 220); }, [fvp?.cx, fvp?.cy, fvp?.scale, flyTo, cameraForViewport]); // eslint-disable-line react-hooks/exhaustive-deps
  const followedPresenting = !!followed?.presenting;
  const stopFollowing = useCallback(() => {
    // Only remember the opt-out when leaving someone's presentation, so it doesn't restart.
    setFollowing((f) => { if (f !== null && followedPresenting) setOptedOutOf(f); return null; });
  }, [followedPresenting]);

  // ── Summon ("bring everyone to me") and reactions from others ──
  const seenSummon = useRef(new Map<number, number>());
  const seenReaction = useRef(new Map<number, number>());
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const addFloating = useCallback((r: Omit<FloatingReaction, "key">) => {
    const key = Math.random().toString(36).slice(2);
    setFloating((f) => [...f.slice(-30), { ...r, key }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.key !== key)), 2600);
  }, []);
  useEffect(() => {
    for (const peer of peers) {
      const st = peer.summon?.t;
      if (st) {
        const seen = seenSummon.current.get(peer.clientId);
        seenSummon.current.set(peer.clientId, st);
        const fresh = seen === undefined ? Date.now() - st < 5000 : seen !== st;
        if (fresh && peer.summon) {
          setFollowing(null);
          flyTo(cameraForViewport(peer.summon.viewport));
          setToast(`${peer.name} brought everyone to their view`);
        }
      }
      const r = peer.reaction;
      if (r) {
        const seen = seenReaction.current.get(peer.clientId);
        seenReaction.current.set(peer.clientId, r.t);
        const fresh = seen === undefined ? Date.now() - r.t < 3000 : seen !== r.t;
        if (fresh) addFloating({ emoji: r.emoji, x: r.x, y: r.y, color: peer.color });
      }
    }
  }, [peers, flyTo, cameraForViewport, addFloating]);

  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const mv = (e: PointerEvent) => { lastPointer.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", mv);
    return () => window.removeEventListener("pointermove", mv);
  }, []);
  const react = (emoji: string) => {
    const sz = screenSize();
    const sp = lastPointer.current && lastPointer.current.y > 70 ? lastPointer.current : { x: sz.width / 2 + (Math.random() - 0.5) * 200, y: sz.height * 0.7 };
    const w = { x: (sp.x - camera.x) / camera.scale, y: (sp.y - camera.y) / camera.scale };
    rawApi.setPresence("reaction", { emoji, ...w, t: Date.now() });
    addFloating({ emoji, ...w, color: me?.color ?? "#0f8573" });
  };
  const summonEveryone = () => {
    rawApi.setPresence("summon", { t: Date.now(), viewport: myViewport() });
    setToast("Everyone has been brought to your view");
  };

  // ── Voting ──
  const vote = session.vote;
  const [voteOpen, setVoteOpen] = useState(false);
  const lastVoteId = useRef<string | null>(null);
  useEffect(() => {
    // Open the panel for everyone when a new vote starts.
    if (vote?.id && vote.id !== lastVoteId.current) {
      if (lastVoteId.current !== null || vote.open) setVoteOpen(true);
      lastVoteId.current = vote.id;
    }
  }, [vote?.id, vote?.open]);
  const voteKey = vote && me ? `${vote.id}|${me.id}` : null;
  const myVotes = useMemo(() => (voteKey ? votes.get(voteKey) ?? [] : []), [votes, voteKey]);
  const castVote = vote?.open && canEdit && voteKey
    ? (id: string) => {
        if (myVotes.includes(id)) rawApi.setVotes(voteKey, myVotes.filter((x) => x !== id));
        else if (myVotes.length < vote.votesPerUser) rawApi.setVotes(voteKey, [...myVotes, id]);
        else setToast("You've used all your votes. Click one of your votes to take it back.");
      }
    : undefined;
  const badges = useMemo(() => {
    if (!vote) return undefined;
    const { counts } = tallyVotes(votes, vote.id);
    const showAll = !vote.open || !vote.anonymous;
    const m = new Map<string, { count: number; mine: number }>();
    const ids = new Set([...myVotes, ...(showAll ? counts.keys() : [])]);
    ids.forEach((id) => m.set(id, { count: showAll ? counts.get(id) ?? 0 : 0, mine: myVotes.includes(id) ? 1 : 0 }));
    return m;
  }, [vote, votes, myVotes]);

  // ── Presentation (frames as slides) ──
  const frames = useMemo(() => elements.filter((e) => e.type === "frame").sort((a, b) =>
    Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2 ? a.x - b.x : a.y - b.y), [elements]);
  const [slide, setSlide] = useState<number | null>(null);
  const presenting = slide !== null;
  const startPresenting = (toEveryone: boolean) => {
    if (!frames.length) { setToast("Add frames to the board first. Each frame becomes a slide."); return; }
    setSelection([]);
    setCommentsOpen(false);
    setVoteOpen(false);
    setFollowing(null);
    setSlide(0);
    if (toEveryone) rawApi.setPresence("presenting", true);
  };
  const stopPresenting = useCallback(() => { setSlide(null); rawApi.setPresence("presenting", false); }, [rawApi]);
  const current = slide !== null ? frames[Math.min(slide, frames.length - 1)] : undefined;
  useEffect(() => {
    if (!current || !canvasRef.current) return;
    flyTo(canvasRef.current.cameraFor({ x: current.x, y: current.y - 34, width: current.width, height: current.height + 34 }, 48));
  }, [current?.id, current?.x, current?.y, current?.width, current?.height, flyTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!presenting) return;
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setSlide((s) => Math.min((s ?? 0) + 1, frames.length - 1)); }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setSlide((s) => Math.max((s ?? 0) - 1, 0)); }
      if (e.key === "Escape") stopPresenting();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [presenting, frames.length, stopPresenting]);
  // Auto-follow someone who presents to everyone.
  const presenter = peers.find((x) => x.presenting);
  useEffect(() => {
    if (presenter && !presenting && optedOutOf !== presenter.clientId && following !== presenter.clientId) {
      setFollowing(presenter.clientId);
      setToast(`${presenter.name} is presenting. You're following along.`);
    }
    if (!presenter && optedOutOf !== null) setOptedOutOf(null);
  }, [presenter?.clientId, presenting]); // eslint-disable-line react-hooks/exhaustive-deps
  const [presentMenu, setPresentMenu] = useState(false);

  // Fit the board to the screen once the first sync arrives.
  const fitted = useRef(false);
  useEffect(() => {
    if (!synced || fitted.current) return;
    // The canvas is loaded lazily, so wait until it has mounted.
    const tryFit = () => {
      if (!canvasRef.current) return void setTimeout(tryFit, 50);
      fitted.current = true;
      canvasRef.current.fitContent();
    };
    tryFit();
  }, [synced]);

  // Drop selection of elements that were deleted (possibly by someone else).
  useEffect(() => {
    const ids = new Set(elements.map((e) => e.id));
    if (selection.some((s) => !ids.has(s))) setSelection(selection.filter((s) => ids.has(s)));
  }, [elements, selection, setSelection]);

  const selected = useMemo(() => elements.filter((e) => selection.includes(e.id)), [elements, selection]);

  // ── Architecture: scale, units, plan import ──
  const unit: Unit = session.unit ?? "m";
  const [placingSymbol, setPlacingSymbol] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [scaleDialog, setScaleDialog] = useState<{ lengthPx: number | null; plan: ImageElement | null } | null>(null);
  const planInputRef = useRef<HTMLInputElement>(null);
  const planAt = (pt: { x: number; y: number }) => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const e = elements[i];
      if (e.type === "image" && pt.x >= e.x && pt.x <= e.x + e.width && pt.y >= e.y && pt.y <= e.y + e.height) return e as ImageElement;
    }
    return null;
  };
  const selectedPlan = selected.length === 1 && selected[0].type === "image" ? (selected[0] as ImageElement) : null;
  const scaleText = (() => {
    const describe = (mpp: number) => `100 px = ${formatLength(mpp * 100, unit)}`;
    if (selectedPlan) {
      const mpp = metersPerPxOfPlan(selectedPlan);
      if (!mpp) return "This plan has no scale yet";
      const pw = selectedPlan.plan?.paperWidthPt;
      return pw ? `Plan at 1:${Math.round((mpp * selectedPlan.width) / (PT_IN_METERS * pw))}` : `Plan: ${describe(mpp)}`;
    }
    const scaled = elements.filter((e) => e.type === "image" && (e as ImageElement).scale).length;
    if (session.boardScale) return `Board: ${describe(session.boardScale.metersPerPx)}`;
    return scaled ? `${scaled} scaled plan${scaled > 1 ? "s" : ""}` : "No scale set";
  })();

  const uploadBlob = async (blob: Blob, name: string) => {
    const fd = new FormData();
    fd.append("file", new File([blob], name, { type: blob.type }));
    const res = await fetch(`/api/boards/${p.boardId}/assets${q}`, { method: "POST", body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
    return (await res.json()).url as string;
  };
  const importPlan = async (file: File) => {
    const center = canvasRef.current?.viewportCenter() ?? { x: 0, y: 0 };
    const baseZ = elements.reduce((m, e) => Math.min(m, e.z), 0) - 1000;
    const name = file.name.replace(/\.[^.]+$/, "");
    try {
      const created: ImageElement[] = [];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setImporting("Reading PDF…");
        const { renderPdf } = await import("./pdfImport");
        const pages = await renderPdf(file, (d, t) => setImporting(`Rendering ${d}/${t}…`));
        let x = center.x - (pages[0]?.widthPt ?? 0) / 2;
        for (const pg of pages) {
          setImporting(`Uploading ${pg.page}/${pages.length}…`);
          const url = await uploadBlob(pg.blob, `${name}-p${pg.page}.png`);
          const el = makeElement("image", x, center.y - pg.heightPt / 2, {
            width: pg.widthPt, height: pg.heightPt, fill: "transparent", stroke: "transparent", locked: true, z: baseZ + pg.page,
          }) as ImageElement;
          el.src = url;
          el.plan = { name, page: pg.page, paperWidthPt: pg.widthPt };
          created.push(el);
          x += pg.widthPt + 120;
        }
      } else if (file.type.startsWith("image/")) {
        setImporting("Uploading…");
        const url = await uploadBlob(file, file.name);
        const img = new window.Image();
        await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
        const k = Math.min(1, 4000 / Math.max(img.width, img.height));
        const el = makeElement("image", center.x - (img.width * k) / 2, center.y - (img.height * k) / 2, {
          width: img.width * k, height: img.height * k, fill: "transparent", stroke: "transparent", locked: true, z: baseZ,
        }) as ImageElement;
        el.src = url;
        el.plan = { name };
        created.push(el);
      } else {
        throw new Error("Choose a PDF or an image (PNG, JPEG, WebP)");
      }
      api.add(created);
      const b = unionRect(created.map(elBounds));
      if (b && canvasRef.current) flyTo(canvasRef.current.cameraFor(b, 80));
      setToast(created.length > 1 ? `Imported ${created.length} sheets. Set the scale to start measuring.` : "Plan imported. Set the scale to start measuring.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(null);
    }
  };

  // ── Shapes & embeds ──
  const [placingShape, setPlacingShape] = useState("triangle");
  const [embedDialog, setEmbedDialog] = useState<string | null>(null);
  const [viewing, setViewing] = useState<EmbedElement | null>(null);
  const addEmbed = useCallback(async (rawUrl: string, at?: { x: number; y: number }) => {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { setError("That doesn't look like a link"); return; }
    const c = at ?? canvasRef.current?.viewportCenter() ?? { x: 0, y: 0 };
    const el = makeElement("embed", c.x - 180, c.y - 60) as EmbedElement;
    el.url = url;
    api.add([el]);
    setSelection([el.id]);
    try {
      const r = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
      if (r.ok) {
        const m = await r.json();
        api.update(el.id, { title: m.title ?? undefined, description: m.description ?? undefined, site: m.site ?? undefined } as Partial<BoardElement>);
      }
    } catch { /* keep the bare link */ }
  }, [api, setSelection]);
  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (looksLikeUrl(text)) { e.preventDefault(); addEmbed(text); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canEdit, addEmbed]);

  // ── Images ──
  const q = p.shareToken ? `?share=${encodeURIComponent(p.shareToken)}` : "";
  const addImageFile = useCallback(async (file: File, at?: { x: number; y: number }) => {
    if (!file.type.startsWith("image/")) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/boards/${p.boardId}/assets${q}`, { method: "POST", body: fd });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Upload failed"); return; }
    const { url } = await res.json();
    const img = new window.Image();
    img.onload = () => {
      const max = 480;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const w = img.width * k, h = img.height * k;
      const c = at ?? canvasRef.current?.viewportCenter() ?? { x: 0, y: 0 };
      const el = makeElement("image", c.x - w / 2, c.y - h / 2, { width: w, height: h, fill: "transparent", stroke: "transparent" }) as ImageElement;
      el.src = url;
      api.add([el]);
      setSelection([el.id]);
    };
    img.src = url;
  }, [api, p.boardId, q, setSelection]);

  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) return;
      const f = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (f) { e.preventDefault(); addImageFile(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canEdit, addImageFile]);

  const duplicateSelected = () => {
    const src = selected.filter((s) => s.type !== "connector");
    const copies: BoardElement[] = src.map((s) => ({ ...s, id: makeElement(s.type, 0, 0).id, x: s.x + 24, y: s.y + 24, z: Date.now() + Math.random() }));
    api.add(copies);
    setSelection(copies.map((c) => c.id));
  };

  const exportPng = () => {
    const url = canvasRef.current?.exportPng();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "board"}.png`;
    a.click();
  };

  if (status === "denied") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-sm p-6 text-center">
          <p>You don't have access to this board.</p>
          <Link href="/w" className="btn-primary mt-4">Go to my boards</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 select-none"
      onDragOver={(e) => { if (canEdit) e.preventDefault(); }}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
        if (f) {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
          addImageFile(f, { x: (sx - camera.x) / camera.scale, y: (sy - camera.y) / camera.scale });
        }
      }}>
      <Canvas
        ref={canvasRef}
        elements={elements}
        api={api}
        peers={peers}
        canEdit={canEdit && !presenting}
        onManualCamera={() => { if (anim.current) { cancelAnimationFrame(anim.current); anim.current = null; } stopFollowing(); }}
        onVote={castVote}
        badges={badges}
        hiddenIds={hiddenIds}
        presenting={presenting}
        tool={tool}
        setTool={setTool}
        selection={selection}
        setSelection={setSelection}
        camera={camera}
        setCamera={setCamera}
        penColor={penColor}
        boardScale={session.boardScale}
        unit={unit}
        placingSymbol={placingSymbol}
        placingShape={placingShape}
        onOpenEmbed={(el) => { if (embedUrlFor(el.url)) setViewing(el); else window.open(el.url, "_blank", "noopener,noreferrer"); }}
        onCalibrate={(l) => setScaleDialog({ lengthPx: Math.hypot(l.x2 - l.x1, l.y2 - l.y1), plan: planAt({ x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 }) })}
        onComment={(pt) => { setCommentDraft(pt); setCommentsOpen(true); setActiveComment(null); }}
        overlay={<>
          {!presenting && <CommentPins comments={comments.comments} camera={camera} activeId={activeComment} draft={commentDraft} showResolved={showResolved}
            onOpen={(id) => { setActiveComment(id); setCommentsOpen(true); }} />}
          {floating.map((r) => (
            <div key={r.key} className="reaction-float pointer-events-none absolute z-[6] text-4xl"
              style={{ left: r.x * camera.scale + camera.x - 20, top: r.y * camera.scale + camera.y - 20 }}>{r.emoji}</div>
          ))}
        </>}
      />

      {followed && (
        <div className="pointer-events-none absolute inset-0 z-[35] border-4" style={{ borderColor: followed.color }}>
          <div className="pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-2 rounded-b-lg px-3 py-1 text-sm font-medium text-white"
            style={{ background: followed.color }}>
            Following {followed.name}
            <button className="rounded bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30" onClick={stopFollowing}>Stop</button>
          </div>
        </div>
      )}

      {presenting && current && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900/90 px-3 py-2 text-sm text-white shadow-xl">
          <button className="rounded p-1 hover:bg-white/10 disabled:opacity-30" disabled={slide === 0} onClick={() => setSlide((s) => Math.max(0, (s ?? 0) - 1))} title="Previous (←)">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[10ch] text-center tabular-nums">{(slide ?? 0) + 1} / {frames.length} · {current.text || "Frame"}</span>
          <button className="rounded p-1 hover:bg-white/10 disabled:opacity-30" disabled={slide === frames.length - 1} onClick={() => setSlide((s) => Math.min(frames.length - 1, (s ?? 0) + 1))} title="Next (→)">
            <ChevronRight size={18} />
          </button>
          <button className="ml-2 flex items-center gap-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={stopPresenting}><X size={14} /> Exit</button>
        </div>
      )}

      {privateOn && !presenting && (
        <div className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white shadow">
          Private mode is on: new notes stay hidden from others until it&apos;s turned off
        </div>
      )}
      {toast && (
        <div className="absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}

      {!presenting && <>
      {/* Top bar */}
      <header className="absolute left-3 right-3 top-3 z-30 flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-lg">
          <Link href={p.workspaceId ? `/w/${p.workspaceId}` : "/w"} className="btn-ghost p-1.5" title="Back to boards">
            <ChevronLeft size={18} /><LogoMark size={22} />
          </Link>
          <input
            className="min-w-0 max-w-[40vw] rounded-md bg-transparent px-2 py-1 text-sm font-medium outline-none hover:bg-slate-50 focus:bg-slate-50"
            value={title}
            disabled={!canEdit || !p.user}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title !== p.title) renameBoard(p.boardId, title).catch(() => setTitle(p.title)); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
          <span className={`mx-1 h-2 w-2 shrink-0 rounded-full ${status === "connected" ? "bg-emerald-500" : "bg-amber-400"}`}
            title={status === "connected" ? "Live" : "Reconnecting…"} />
          {!canEdit && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">View only</span>}
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-lg">
          <TimerWidget timer={session.timer} canEdit={canEdit} me={me?.name ?? ""} onChange={(t) => api.setSession("timer", t)} />
          <div className="flex -space-x-2">
            {me && <Avatar name={`${me.name} (you)`} color={me.color} size={28} />}
            {dedupePeers(peers).slice(0, 5).map((x) => (
              <button key={x.clientId} title={following === x.clientId ? `Stop following ${x.name}` : `Follow ${x.name}`}
                className={`rounded-full ${following === x.clientId ? "ring-2 ring-offset-1" : ""}`} style={{ ["--tw-ring-color" as string]: x.color }}
                onClick={() => (following === x.clientId ? stopFollowing() : setFollowing(x.clientId))}>
                <Avatar name={x.name} color={x.color} size={28} />
              </button>
            ))}
            {peers.length > 5 && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs ring-2 ring-white">+{peers.length - 5}</span>}
          </div>
          {canEdit && peers.length > 0 && (
            <button className="btn-ghost p-1.5" title="Bring everyone to my view" onClick={summonEveryone}><Users size={18} /></button>
          )}
          <div className="h-6 w-px bg-slate-200" />
          <ReactionPicker onReact={react} />
          <PrivateModeButton mode={session.privateMode} canEdit={canEdit} me={me?.id ?? ""} onChange={setPrivateMode} />
          <button className={`btn-ghost p-1.5 ${voteOpen || vote?.open ? "bg-slate-100" : ""} ${vote?.open ? "text-brand-700" : ""}`} title="Voting"
            onClick={() => { setVoteOpen((o) => !o); setCommentsOpen(false); }}>
            <Vote size={18} />
          </button>
          <div className="relative">
            <button className="btn-ghost p-1.5" title="Present frames as slides" onClick={() => setPresentMenu((o) => !o)}><Presentation size={18} /></button>
            {presentMenu && (
              <div className="card absolute right-0 top-10 z-30 w-56 p-1" onMouseLeave={() => setPresentMenu(false)}>
                <button className="btn-ghost w-full justify-start" onClick={() => { setPresentMenu(false); startPresenting(false); }}>Present on my screen</button>
                {canEdit && <button className="btn-ghost w-full justify-start" onClick={() => { setPresentMenu(false); startPresenting(true); }}>Present to everyone</button>}
                <p className="px-3 pb-1 text-xs text-slate-500">{frames.length} frame{frames.length === 1 ? "" : "s"}, shown in reading order.</p>
              </div>
            )}
          </div>
          <button className={`btn-ghost p-1.5 ${commentsOpen ? "bg-slate-100" : ""}`} title="Comments" onClick={() => { setCommentsOpen((o) => !o); setVoteOpen(false); }}>
            <MessageSquare size={18} />
          </button>
          <button className="btn-ghost p-1.5" title="Export PNG" onClick={exportPng}><Download size={18} /></button>
          {p.sharing && <button className="btn-primary py-1.5" onClick={() => setShareOpen(true)}><Share2 size={16} /> Share</button>}
        </div>
      </header>

      <Toolbar tool={tool} setTool={setTool} canEdit={canEdit} canComment={!!p.user} onImage={() => fileRef.current?.click()}
        onEmbed={() => setEmbedDialog("")} placingShape={placingShape} setPlacingShape={setPlacingShape} />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addImageFile(f); e.target.value = ""; }} />

      {canEdit && (
        <ArchToolbar tool={tool} setTool={setTool} onImportPlan={() => planInputRef.current?.click()} importing={importing}
          placingSymbol={placingSymbol} setPlacingSymbol={setPlacingSymbol}
          unit={unit} setUnit={(u) => api.setSession("unit", u)} scaleText={scaleText} />
      )}
      <input ref={planInputRef} type="file" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importPlan(f); e.target.value = ""; }} />

      {(tool === "pen" || tool === "highlighter") && (
        <div className="absolute left-16 top-1/2 z-10 ml-2 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {["#111827", "#0f8573", "#2563eb", "#db2777", "#ea580c", "#ca8a04"].map((c) => (
            <button key={c} onClick={() => setPenColor(c)} className={`h-6 w-6 rounded-full ${penColor === c ? "ring-2 ring-brand-500 ring-offset-1" : ""}`} style={{ background: c }} />
          ))}
        </div>
      )}

      {canEdit && <PropertiesBar selected={selected} all={elements} api={api} onDuplicate={duplicateSelected}
        onSetScale={selectedPlan ? () => setScaleDialog({ lengthPx: null, plan: selectedPlan }) : undefined}
        members={p.members}
        onDelete={() => { api.remove(selection); setSelection([]); }} />}

      {/* Zoom */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
        <button className="btn-ghost p-1.5" title="Zoom out" onClick={() => canvasRef.current?.zoomBy(1 / 1.2)}><Minus size={16} /></button>
        <button className="w-14 text-center text-xs tabular-nums" title="Reset to 100%" onClick={() => canvasRef.current?.zoomTo(1)}>
          {Math.round(camera.scale * 100)}%
        </button>
        <button className="btn-ghost p-1.5" title="Zoom in" onClick={() => canvasRef.current?.zoomBy(1.2)}><Plus size={16} /></button>
        <button className="btn-ghost p-1.5" title="Fit to content" onClick={() => canvasRef.current?.fitContent()}><Maximize size={16} /></button>
        {canEdit && (
          <>
            <div className="mx-0.5 h-5 w-px bg-slate-200" />
            <button className="btn-ghost p-1.5" title="Undo (Ctrl+Z)" onClick={api.undo}><Undo2 size={16} /></button>
            <button className="btn-ghost p-1.5" title="Redo (Ctrl+Shift+Z)" onClick={api.redo}><Redo2 size={16} /></button>
          </>
        )}
      </div>
      </>}

      {!synced && status !== "connected" && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white">Connecting…</div>
      )}
      {error && (
        <button className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white" onClick={() => setError(null)}>{error}</button>
      )}

      {commentsOpen && !presenting && (
        <CommentPanel comments={comments.comments} activeId={activeComment} setActiveId={setActiveComment} draft={commentDraft} setDraft={setCommentDraft}
          api={comments} meId={p.user?.id ?? null} canEdit={canEdit} signedIn={!!p.user} showResolved={showResolved} setShowResolved={setShowResolved}
          onClose={() => { setCommentsOpen(false); setCommentDraft(null); }}
          onFocus={(c) => setCamera((cam) => ({ ...cam, x: window.innerWidth / 2 - c.x * cam.scale, y: window.innerHeight / 2 - c.y * cam.scale }))} />
      )}

      {voteOpen && !commentsOpen && !presenting && (
        <VotePanel vote={vote} votes={votes} myVotes={myVotes} canEdit={canEdit} me={me?.name ?? ""} elements={elements}
          onStart={(v) => { api.setSession("vote", v); setSelection([]); }}
          onEnd={() => vote && api.setSession("vote", { ...vote, open: false })}
          onClear={() => { if (vote) rawApi.clearVotes(vote.id); api.setSession("vote", null); }}
          onFocus={(el) => canvasRef.current && flyTo(canvasRef.current.cameraFor({ x: el.x, y: el.y, width: el.width, height: el.height }, 200))}
          onClose={() => setVoteOpen(false)} />
      )}

      {embedDialog !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setEmbedDialog(null)}>
          <form className="card w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (embedDialog.trim()) addEmbed(embedDialog); setEmbedDialog(null); }}>
            <h2 className="text-lg font-semibold">Embed a link</h2>
            <input autoFocus className="input" placeholder="https://… (YouTube, Vimeo, Figma, Loom or any web page)" value={embedDialog}
              onChange={(e) => setEmbedDialog(e.target.value)} />
            <p className="text-xs text-slate-500">Tip: you can also paste a link straight onto the board.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEmbedDialog(null)}>Cancel</button>
              <button className="btn-primary">Add</button>
            </div>
          </form>
        </div>
      )}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setViewing(null)}>
          <div className="w-full max-w-4xl space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-white">
              <span className="truncate font-medium">{viewing.title || viewing.url}</span>
              <div className="flex gap-2">
                <a className="btn-ghost text-white hover:bg-white/10" href={viewing.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open</a>
                <button className="btn-ghost text-white hover:bg-white/10" onClick={() => setViewing(null)}><X size={16} /></button>
              </div>
            </div>
            <iframe src={embedUrlFor(viewing.url) ?? undefined} className="aspect-video w-full rounded-lg bg-black" allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" title={viewing.title || "Embedded content"} />
          </div>
        </div>
      )}

      {scaleDialog && (
        <ScaleDialog lengthPx={scaleDialog.lengthPx} plan={scaleDialog.plan} unit={unit} onClose={() => setScaleDialog(null)}
          onSavePlan={(pl, mpp) => { api.update(pl.id, { scale: { metersPerPx: mpp, refWidth: pl.width } } as Partial<BoardElement>); setToast("Scale saved for this plan"); }}
          onSaveBoard={(mpp) => { api.setSession("boardScale", { metersPerPx: mpp }); setToast("Scale saved for the board"); }} />
      )}

      {shareOpen && p.sharing && (
        <ShareDialog boardId={p.boardId} initial={p.sharing} teams={p.teams} canManage={p.canManage} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

function dedupePeers<T extends { name: string; color: string }>(peers: T[]) {
  const seen = new Set<string>();
  return peers.filter((x) => { const k = x.name + x.color; if (seen.has(k)) return false; seen.add(k); return true; });
}
