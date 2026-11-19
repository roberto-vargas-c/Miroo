import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { loadWorkspace } from "@/lib/workspace";
import { AUDIT_LABELS } from "@/lib/audit";
import { auditWhere, describeDetails, type AuditFilters } from "@/lib/auditQuery";

const PAGE = 50;
const GROUPS: [string, string][] = [
  ["member.", "Members & invites"], ["team.", "Teams"], ["board.", "Boards"], ["folder.", "Folders"],
  ["template.", "Templates"], ["domain.", "Domains"], ["sso.", "Single sign-on"], ["workspace.", "Workspace"],
];

export default async function AuditPage({ params, searchParams }: {
  params: Promise<{ wid: string }>;
  searchParams: Promise<AuditFilters & { page?: string }>;
}) {
  const { wid } = await params;
  const sp = await searchParams;
  const { role } = await loadWorkspace(wid);
  if (!atLeast(role, "ADMIN")) notFound();
  const page = Math.max(1, Number(sp.page) || 1);
  const where = auditWhere(wid, sp);
  const [events, total, members] = await Promise.all([
    db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditEvent.count({ where }),
    db.workspaceMember.findMany({ where: { workspaceId: wid }, include: { user: { select: { id: true, name: true } } } }),
  ]);
  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ action: sp.action, actor: sp.actor, q: sp.q, from: sp.from, to: sp.to, ...extra })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-sm text-slate-500">Who changed what in this workspace. Only admins and owners can see this.</p>
        </div>
        <a className="btn-outline" href={`/api/workspaces/${wid}/audit${qs({})}`}><Download size={16} /> Export CSV</a>
      </div>

      <form className="card flex flex-wrap items-end gap-2 p-3 text-sm">
        <div>
          <label className="label" htmlFor="action">Activity</label>
          <select id="action" name="action" defaultValue={sp.action ?? ""} className="input w-auto py-1.5">
            <option value="">All activity</option>
            {GROUPS.map(([prefix, label]) => (
              <optgroup key={prefix} label={label}>
                <option value={prefix}>All {label.toLowerCase()}</option>
                {Object.entries(AUDIT_LABELS).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="actor">Person</label>
          <select id="actor" name="actor" defaultValue={sp.actor ?? ""} className="input w-auto py-1.5">
            <option value="">Anyone</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={sp.from} className="input w-auto py-1" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={sp.to} className="input w-auto py-1" />
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Board, person, domain…" className="input py-1.5" />
        </div>
        <button className="btn-primary py-1.5">Filter</button>
        {(sp.action || sp.actor || sp.q || sp.from || sp.to) && <Link href={`/w/${wid}/audit`} className="btn-ghost py-1.5">Clear</Link>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Who</th><th className="p-3 font-medium">What</th><th className="p-3 font-medium">Details</th></tr>
          </thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Nothing recorded yet.</td></tr>}
            {events.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 align-top last:border-0">
                <td className="whitespace-nowrap p-3 text-slate-500" title={e.createdAt.toISOString()}>
                  {e.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC
                </td>
                <td className="p-3">{e.actorName}{e.ip && <div className="text-xs text-slate-400">{e.ip}</div>}</td>
                <td className="p-3">
                  {AUDIT_LABELS[e.action] ?? e.action}
                  {e.targetName && <span className="text-slate-500">: <b className="font-medium text-slate-700">{e.targetName}</b></span>}
                </td>
                <td className="max-w-xs break-words p-3 text-xs text-slate-500">{describeDetails(e.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{total} events · page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-outline py-1" href={`/w/${wid}/audit${qs({ page: page - 1 })}`}>Newer</Link>}
            {page < pages && <Link className="btn-outline py-1" href={`/w/${wid}/audit${qs({ page: page + 1 })}`}>Older</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
