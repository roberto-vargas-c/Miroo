import { makeElement, STICKY_COLORS, type BoardElement, type CardElement, type CardStatus, type TableElement } from "./types";

/** Parse CSV / TSV text (RFC 4180 quoting). The delimiter is detected from the first line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

export type CsvMode = "sticky" | "card" | "table";
export const CSV_LIMITS = { rows: 500, tableRows: 100, tableCols: 20 };

const find = (header: string[], names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));

function statusOf(v: string): CardStatus {
  const s = v.trim().toLowerCase();
  if (/^(done|complete|completed|closed|finished|hecho|terminado)$/.test(s)) return "done";
  if (/^(doing|in progress|in-progress|started|wip|en progreso|en curso)$/.test(s)) return "doing";
  if (/^(blocked|on hold|stuck|bloqueado)$/.test(s)) return "blocked";
  return "todo";
}

/** yyyy-mm-dd from common date spellings, or null. */
function dateOf(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * Turn CSV rows into board elements laid out in a grid starting at (x, y).
 * With `hasHeader`, the first row names the columns: for cards, columns called title/task/name,
 * status, assignee/owner and due/date are recognized (English or Spanish names).
 */
export function csvToElements(
  rows: string[][], mode: CsvMode, hasHeader: boolean, at: { x: number; y: number },
  members: { id: string; name: string; color: string }[] = [],
): BoardElement[] {
  if (!rows.length) return [];
  const header = hasHeader ? rows[0] : [];
  const body = (hasHeader ? rows.slice(1) : rows);

  if (mode === "table") {
    const cols = Math.min(CSV_LIMITS.tableCols, Math.max(...rows.map((r) => r.length)));
    const used = rows.slice(0, CSV_LIMITS.tableRows + (hasHeader ? 1 : 0));
    const cells = used.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
    const t = makeElement("table", at.x, at.y, { width: Math.max(240, cols * 160), height: cells.length * 40 }) as TableElement;
    t.cells = cells;
    t.header = hasHeader;
    return [t];
  }

  const items = body.slice(0, CSV_LIMITS.rows);
  const perRow = Math.max(1, Math.ceil(Math.sqrt(items.length * (mode === "card" ? 0.6 : 1))));
  const z = Date.now();

  if (mode === "sticky") {
    return items.map((r, i) => makeElement("sticky", at.x + (i % perRow) * 200, at.y + Math.floor(i / perRow) * 200, {
      text: r.filter(Boolean).join("\n"), fill: STICKY_COLORS[0], z: z + i,
    }));
  }

  const iTitle = Math.max(0, find(header, ["title", "task", "name", "nombre", "tarea", "título", "titulo"]));
  const iStatus = find(header, ["status", "state", "estado"]);
  const iWho = find(header, ["assignee", "owner", "assigned to", "responsable", "asignado"]);
  const iDue = find(header, ["due", "due date", "deadline", "date", "fecha", "vence"]);
  return items.map((r, i) => {
    const who = iWho >= 0 ? r[iWho]?.toLowerCase() : "";
    const member = who ? members.find((m) => m.name.toLowerCase() === who || m.name.toLowerCase().split(" ")[0] === who) : undefined;
    const card = makeElement("card", at.x + (i % perRow) * 280, at.y + Math.floor(i / perRow) * 140, { text: r[iTitle] || "Untitled", z: z + i }) as CardElement;
    if (iStatus >= 0) card.status = statusOf(r[iStatus] ?? "");
    if (iDue >= 0) card.due = dateOf(r[iDue] ?? "");
    if (member) card.assignee = member;
    return card;
  });
}
