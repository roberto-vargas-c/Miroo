import "server-only";
import type { Prisma } from "@prisma/client";

export type AuditFilters = { action?: string; actor?: string; q?: string; from?: string; to?: string };

/** Where-clause for the audit log page and its CSV export. */
export function auditWhere(workspaceId: string, f: AuditFilters): Prisma.AuditEventWhereInput {
  const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : undefined);
  const from = day(f.from), to = day(f.to);
  return {
    workspaceId,
    ...(f.action ? (f.action.endsWith(".") ? { action: { startsWith: f.action } } : { action: f.action }) : {}),
    ...(f.actor ? { actorId: f.actor } : {}),
    ...(f.q ? { OR: [{ targetName: { contains: f.q, mode: "insensitive" } }, { actorName: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400_000) } : {}) } } : {}),
  };
}

export function describeDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  return Object.entries(details as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      if (v && typeof v === "object" && "from" in v && "to" in v) return `${k}: ${String((v as { from: unknown }).from)} → ${String((v as { to: unknown }).to)}`;
      if (v && typeof v === "object") return `${k}: ${Object.entries(v as Record<string, unknown>).map(([a, b]) => `${a} ${String(b)}`).join(", ")}`;
      return `${k}: ${String(v)}`;
    })
    .join(" · ");
}
