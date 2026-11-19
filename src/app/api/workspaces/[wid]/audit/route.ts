import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { atLeast, workspaceRole } from "@/lib/permissions";
import { AUDIT_LABELS } from "@/lib/audit";
import { auditWhere, describeDetails } from "@/lib/auditQuery";

const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheets from running it as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV export of the audit log, with the same filters as the page (up to 50,000 rows). */
export async function GET(req: Request, { params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const user = await currentUser();
  if (!user || !atLeast(await workspaceRole(user.id, wid), "ADMIN")) return new Response("Not allowed", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const events = await db.auditEvent.findMany({ where: auditWhere(wid, sp), orderBy: { createdAt: "desc" }, take: 50_000 });
  const rows = [["time_utc", "actor", "actor_id", "action", "description", "target_type", "target_id", "target", "details", "ip"]];
  for (const e of events) {
    rows.push([e.createdAt.toISOString(), e.actorName, e.actorId ?? "", e.action, AUDIT_LABELS[e.action] ?? "", e.targetType ?? "", e.targetId ?? "",
      e.targetName ?? "", describeDetails(e.details), e.ip ?? ""]);
  }
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
