import { atLeast } from "@/lib/permissions";
import { loadWorkspace } from "@/lib/workspace";
import { deleteWorkspace, renameWorkspace } from "@/app/actions/workspace";
import { ConfirmButton } from "@/components/ConfirmButton";

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
