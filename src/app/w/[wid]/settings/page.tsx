import { atLeast } from "@/lib/permissions";
import { loadWorkspace } from "@/lib/workspace";
import { deleteWorkspace, renameWorkspace } from "@/app/actions/workspace";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ActionForm } from "@/components/ActionForm";
import { DomainRow } from "@/components/DomainRow";
import { db } from "@/lib/db";
import { addDomain, saveSso } from "@/app/actions/admin";
import { TXT_PREFIX } from "@/lib/auth/domains";
import { callbackUrl } from "@/lib/auth/oidc";

export default async function SettingsPage({ params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { role, workspace } = await loadWorkspace(wid);
  const isAdmin = atLeast(role, "ADMIN");
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Workspace settings</h1>
      <form action={renameWorkspace.bind(null, wid)} className="card space-y-3 p-5">
        <label className="label" htmlFor="name">Workspace name</label>
        <input className="input" id="name" name="name" defaultValue={workspace.name} disabled={!isAdmin} />
        {isAdmin && <button className="btn-primary">Save</button>}
      </form>
      {isAdmin && <DomainsAndSso wid={wid} />}
      {role === "OWNER" && (
        <section className="card space-y-3 border-rose-200 p-5">
          <h2 className="font-semibold text-rose-700">Delete workspace</h2>
          <p className="text-sm text-slate-600">This permanently deletes every board, team and invite in this workspace.</p>
          <ConfirmButton action={deleteWorkspace.bind(null, wid)} message={`Delete “${workspace.name}” and all its boards?`} className="btn-danger">
            Delete workspace
          </ConfirmButton>
        </section>
      )}
    </div>
  );
}

async function DomainsAndSso({ wid }: { wid: string }) {
  const domains = await db.workspaceDomain.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "asc" } });
  const sso = await db.workspaceSso.findUnique({ where: { workspaceId: wid } });
  const verified = domains.filter((d) => d.verifiedAt);
  return (
    <>
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Company email domains</h2>
          <p className="text-sm text-slate-500">
            Verify the domain your team&apos;s emails use. Then people at that domain can join this workspace when they sign up,
            and single sign-on can sign them in.
          </p>
        </div>
        {domains.length > 0 && (
          <ul className="space-y-2">
            {domains.map((d) => (
              <DomainRow key={d.id} txt={`${TXT_PREFIX}${d.verifyToken}`}
                d={{ id: d.id, domain: d.domain, verified: !!d.verifiedAt, autoJoin: d.autoJoin, joinRole: d.joinRole }} />
            ))}
          </ul>
        )}
        <ActionForm action={addDomain.bind(null, wid)} submit="Add domain" className="flex flex-wrap items-start gap-2 [&>button]:w-auto">
          <input name="domain" className="input min-w-0 flex-1" placeholder="studio.com" required />
        </ActionForm>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Single sign-on (SSO)</h2>
          <p className="text-sm text-slate-500">
            Sign people in through your identity provider with OpenID Connect: Okta, Microsoft Entra ID, Google Workspace, Auth0,
            OneLogin, JumpCloud and others. Create an OIDC web app there with this redirect URL:
          </p>
          <code className="mt-2 block truncate rounded-md bg-slate-50 p-2 text-xs">{callbackUrl()}</code>
        </div>
        <ActionForm action={saveSso.bind(null, wid)} submit="Save SSO settings">
          <div>
            <label className="label" htmlFor="issuer">Issuer URL</label>
            <input className="input" id="issuer" name="issuer" defaultValue={sso?.issuer ?? ""} placeholder="https://yourcompany.okta.com" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="clientId">Client ID</label>
              <input className="input" id="clientId" name="clientId" defaultValue={sso?.clientId ?? ""} required />
            </div>
            <div>
              <label className="label" htmlFor="clientSecret">Client secret</label>
              <input className="input" id="clientSecret" name="clientSecret" type="password" autoComplete="off"
                placeholder={sso ? "Saved. Leave blank to keep it" : ""} required={!sso} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={sso?.enabled ?? false} disabled={!verified.length} />
            Turn on single sign-on{!verified.length && " (verify a domain first)"}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enforce" defaultChecked={sso?.enforce ?? false} disabled={!verified.length} />
            Require SSO: people at {verified.length ? verified.map((d) => `@${d.domain}`).join(", ") : "your domains"} can&apos;t use a password
          </label>
        </ActionForm>
      </section>
    </>
  );
}
