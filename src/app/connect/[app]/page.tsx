import { Logo } from "@/components/Logo";
import { requireUser } from "@/lib/session";
import { appFor } from "@/lib/apps";
import { allowApp, denyApp } from "@/app/actions/apps";

// "Allow Keystone to add to your boards?": the consent page of an app connection (see src/lib/apps.ts).
export default async function ConnectAppPage({ params, searchParams }: {
  params: Promise<{ app: string }>; searchParams: Promise<{ redirect_uri?: string; state?: string }>;
}) {
  const { app: appId } = await params;
  const { redirect_uri: redirectUri = "", state = "" } = await searchParams;
  const app = appFor(appId, redirectUri);
  const here = `/connect/${encodeURIComponent(appId)}?${new URLSearchParams({ redirect_uri: redirectUri, state })}`;
  const user = await requireUser(here);
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 bg-gradient-to-br from-brand-50 via-white to-amber-50 p-6">
      <Logo />
      <div className="card w-full max-w-md space-y-4 p-7">
        {!app ? (
          <>
            <h1 className="text-lg font-semibold">This link can&apos;t connect an app</h1>
            <p className="text-sm text-slate-600">The app that sent you here isn&apos;t one this Schema knows, or it sent you from another address.
              If it is your own Keystone, set <code>KEYSTONE_URL</code> on Schema to its address.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Connect {app.name} to your Schema account?</h1>
            <p className="text-sm text-slate-600">{app.name} at <b>{new URL(redirectUri).host}</b> asks to:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{app.does.map((d) => <li key={d}>{d}</li>)}</ul>
            <p className="text-sm text-slate-600">It acts as <b>{user.name}</b> ({user.email}) and can only reach boards you can edit.
              You can disconnect it at any time on your profile page.</p>
            <div className="flex justify-end gap-2 pt-2">
              <form action={denyApp.bind(null, app.id, redirectUri, state)}><button className="btn-ghost">Cancel</button></form>
              <form action={allowApp.bind(null, app.id, redirectUri, state)}><button className="btn-primary">Allow</button></form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
