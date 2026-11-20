"use client";

import type { BoardElement, EmbedElement, ImageElement, VideoElement } from "@/lib/board/types";

/** Something in the selection that can be saved as a file: a stored file, or a PDF rebuilt from its pages. */
export type Download = { url: string; name: string } | { pages: ImageElement[]; name: string };

const ASSET = /^\/api\/assets\/([0-9a-f]+)/;
const isPage = (e: BoardElement): e is ImageElement => e.type === "image" && !!(e as ImageElement).plan?.page;

/** Files behind the selected images, videos, file cards and PDF pages (each PDF once, whichever of its pages are selected). */
export function downloadsFor(selected: BoardElement[], all: BoardElement[]): Download[] {
  const out: Download[] = [];
  const seenPdf = new Set<string>();
  for (const el of selected) {
    if (isPage(el)) {
      const plan = el.plan!;
      const key = plan.source ?? `name:${plan.name}`;
      if (seenPdf.has(key)) continue;
      seenPdf.add(key);
      const name = `${plan.name || "document"}.pdf`;
      if (plan.source) out.push({ url: plan.source, name });
      else {
        // PDFs placed before the original file was kept: put the pages back together.
        const pages = all.filter((e): e is ImageElement => isPage(e) && !e.plan!.source && e.plan!.name === plan.name)
          .sort((a, b) => a.plan!.page! - b.plan!.page!);
        out.push({ pages, name });
      }
    } else if (el.type === "image") {
      const img = el as ImageElement;
      if (img.src) out.push({ url: img.src, name: img.plan?.name || "image" });
    } else if (el.type === "video") {
      const v = el as VideoElement;
      if (v.src) out.push({ url: v.src, name: v.name || "video" });
    } else if (el.type === "embed" && ASSET.test((el as EmbedElement).url)) {
      const e = el as EmbedElement;
      out.push({ url: e.url, name: e.title || new URL(e.url, location.origin).searchParams.get("name") || "file" });
    }
  }
  return out;
}

/** The address that saves a board file: the asset route checks that the person can edit the board. */
export function downloadUrl(url: string, name: string, boardId: string, shareToken: string | null) {
  const m = ASSET.exec(url);
  if (!m) return url;
  const q = new URLSearchParams({ download: "1", name, board: boardId });
  if (shareToken) q.set("share", shareToken);
  return `/api/assets/${m[1]}?${q}`;
}

/** Saves each download in turn (spaced out so the browser doesn't drop any). */
export async function runDownloads(items: Download[], boardId: string, shareToken: string | null, onProgress?: (msg: string) => void) {
  for (const [i, d] of items.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 400));
    if ("url" in d) {
      if (ASSET.test(d.url)) {
        // Check first, so a refused download shows a message instead of an error page.
        const href = downloadUrl(d.url, d.name, boardId, shareToken);
        const res = await fetch(href, { method: "HEAD" });
        if (res.status === 403) throw new Error("Only editors can download files from this board.");
        if (!res.ok) throw new Error(`Couldn't download ${d.name}.`);
        save(href, d.name);
      } else if (d.url.startsWith("data:")) save(d.url, d.name);
      else window.open(d.url, "_blank", "noopener,noreferrer");
    } else {
      onProgress?.(`Preparing ${d.name}…`);
      const blob = await pagesToPdf(d.pages);
      const href = URL.createObjectURL(blob);
      save(href, d.name);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }
  }
}

function save(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function pagesToPdf(pages: ImageElement[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const pg of pages) {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = pg.src; });
    // Sheets are PNG, WebP or JPEG; redraw them as JPEG, which every PDF reader understands.
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const data = canvas.toDataURL("image/jpeg", 0.92);
    const w = pg.plan?.paperWidthPt ?? pg.width;
    const h = w * (img.naturalHeight / img.naturalWidth);
    const orientation = w > h ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ unit: "pt", format: [w, h], orientation, compress: true });
    else pdf.addPage([w, h], orientation);
    pdf.addImage(data, "JPEG", 0, 0, w, h, undefined, "FAST");
  }
  if (!pdf) throw new Error("The PDF has no pages.");
  return pdf.output("blob");
}
