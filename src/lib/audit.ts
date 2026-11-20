import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export type AuditTarget = { type: string; id?: string | null; name?: string | null };

/** Record something that happened in a workspace. Never throws: auditing must not break the action. */
export async function audit(
  workspaceId: string,
  actor: { id: string; name: string } | null,
  action: string,
  target?: AuditTarget,
  details?: Record<string, unknown>,
) {
  try {
    let ip: string | null = null;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    } catch {
      /* outside a request */
    }
    await db.auditEvent.create({
      data: {
        workspaceId, actorId: actor?.id ?? null, actorName: actor?.name ?? "System", action,
        targetType: target?.type ?? null, targetId: target?.id ?? null, targetName: target?.name ?? null,
        details: (details ?? undefined) as Prisma.InputJsonValue | undefined, ip,
      },
    });
  } catch (e) {
    console.error("[audit] failed to record", action, e);
  }
}

/** Human-readable labels for the audit log page and CSV export. */
export const AUDIT_LABELS: Record<string, string> = {
  "workspace.created": "Created the workspace",
  "workspace.renamed": "Renamed the workspace",
  "member.invited": "Invited a member",
  "invite.revoked": "Revoked an invite",
  "member.joined": "Joined from an invite",
  "member.joined_domain": "Joined via company domain",
  "member.joined_sso": "Joined via SSO",
  "member.role_changed": "Changed a member's role",
  "member.removed": "Removed a member",
  "team.created": "Created a team",
  "team.deleted": "Deleted a team",
  "team.member_added": "Added someone to a team",
  "team.member_removed": "Removed someone from a team",
  "board.created": "Created a board",
  "board.deleted": "Deleted a board",
  "board.sharing_changed": "Changed board sharing",
  "board.moved": "Moved a board to a folder",
  "board.items_added": "Added pictures from an app",
  "folder.created": "Created a folder",
  "folder.renamed": "Renamed a folder",
  "folder.deleted": "Deleted a folder",
  "template.created": "Saved a template",
  "template.deleted": "Deleted a template",
  "domain.added": "Added a domain",
  "domain.verified": "Verified a domain",
  "domain.updated": "Changed domain sign-up",
  "domain.removed": "Removed a domain",
  "sso.updated": "Changed SSO settings",
  "sso.login": "Signed in with SSO",
};
