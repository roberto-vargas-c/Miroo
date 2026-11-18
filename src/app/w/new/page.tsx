import { createWorkspace } from "@/app/actions/workspace";
import { Logo } from "@/components/Logo";
import { requireUser } from "@/lib/session";

export default async function NewWorkspace() {
  await requireUser("/w/new");
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 p-6">
      <Logo />
      <form action={createWorkspace} className="card w-full max-w-sm space-y-4 p-7">
        <h1 className="text-xl font-semibold">Create a workspace</h1>
        <p className="text-sm text-slate-600">A workspace holds your boards, teams and members.</p>
        <div>
          <label className="label" htmlFor="name">Workspace name</label>
          <input className="input" id="name" name="name" required placeholder="Acme Inc." />
        </div>
        <button className="btn-primary w-full">Create workspace</button>
      </form>
    </div>
  );
}
