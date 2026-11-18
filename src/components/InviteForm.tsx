"use client";

import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import { inviteMember, type ActionResult } from "@/app/actions/workspace";

export function InviteForm({ workspaceId, canInviteOwner }: { workspaceId: string; canInviteOwner: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(inviteMember.bind(null, workspaceId), undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-2">
        <input name="email" type="email" required placeholder="name@company.com" className="input min-w-0 flex-1" />
        <select name="role" defaultValue="MEMBER" className="input w-auto">
          {canInviteOwner && <option value="OWNER">Owner</option>}
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Member</option>
          <option value="VIEWER">Viewer</option>
        </select>
        <button className="btn-primary" disabled={pending}>Create invite</button>
      </form>
      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state?.link && (
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-2 text-sm">
          <code className="min-w-0 flex-1 truncate">{state.link}</code>
          <button type="button" className="btn-outline py-1" onClick={() => { navigator.clipboard.writeText(state.link!); setCopied(true); }}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
