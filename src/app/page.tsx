import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { currentUser } from "@/lib/session";

const FEATURES = [
  ["Endless canvas", "Zoom, pan and arrange sticky notes, shapes, text, drawings, images and frames."],
  ["Live together", "See teammates' cursors and edits as they happen."],
  ["Workspaces & teams", "Organize boards by workspace, invite people, and control access with roles."],
  ["Comment & share", "Pin comments on the canvas and share boards with a view or edit link."],
];

export default async function Home() {
  if (await currentUser()) redirect("/w");
  return (
    <main className="min-h-full bg-gradient-to-br from-brand-50 via-white to-amber-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <Logo />
        <nav className="flex gap-2">
          <Link className="btn-ghost" href="/login">Log in</Link>
          <Link className="btn-primary" href="/signup">Get started</Link>
        </nav>
      </header>
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight">{PRODUCT_TAGLINE}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          {PRODUCT_NAME} is a collaborative whiteboard for brainstorming, planning and mapping ideas with your team.
        </p>
        <Link className="btn-primary mt-8 px-6 py-3 text-base" href="/signup">Create a free board</Link>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="card p-6">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
