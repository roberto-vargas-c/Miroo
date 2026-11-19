"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Check, Trash2 } from "lucide-react";
import { verifyDomain, removeDomain, updateDomain } from "@/app/actions/admin";

export function DomainRow({ d, txt }: {
  d: { id: string; domain: string; verified: boolean; autoJoin: boolean; joinRole: "MEMBER" | "VIEWER" | string };
  txt: string;
}) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{d.domain}</span>
        {d.verified
          ? <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700"><CheckCircle2 size={12} /> Verified</span>
          : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Not verified</span>}
        <button type="button" className="ml-auto rounded p-1 text-slate-400 hover:text-rose-600" title="Remove domain" disabled={pending}
          onClick={() => { if (window.confirm(`Remove ${d.domain}? SSO and automatic joining stop for this domain.`)) start(() => removeDomain(d.id)); }}>
          <Trash2 size={14} />
        </button>
      </div>
      {!d.verified && (
        <div className="space-y-2 text-sm">
          <p className="text-slate-600">Add this TXT record to the DNS of <b>{d.domain}</b>, then press Verify:</p>
          <div className="flex items-center gap-2 rounded-md bg-slate-50 p-2">
            <code className="min-w-0 flex-1 truncate text-xs">{txt}</code>
            <button type="button" className="btn-outline py-1 text-xs" onClick={() => { navigator.clipboard.writeText(txt); setCopied(true); }}>
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button type="button" className="btn-primary py-1 text-sm" disabled={pending}
            onClick={() => start(async () => setMsg((await verifyDomain(d.id)) ?? null))}>
            {pending ? "Checking…" : "Verify"}
          </button>
        </div>
      )}
      {d.verified && (
        <form action={updateDomain.bind(null, d.id)} className="flex flex-wrap items-center gap-2 text-sm"
          onChange={(e) => e.currentTarget.requestSubmit()}>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoJoin" defaultChecked={d.autoJoin} />
            People who sign up with an @{d.domain} email join automatically as
          </label>
          <select name="joinRole" defaultValue={d.joinRole} className="rounded-md border border-slate-200 px-1 py-0.5 text-sm">
            <option value="MEMBER">members</option>
            <option value="VIEWER">viewers</option>
          </select>
        </form>
      )}
      {msg?.error && <p className="text-sm text-rose-600">{msg.error}</p>}
      {msg?.ok && <p className="text-sm text-brand-700">{msg.ok}</p>}
    </li>
  );
}
