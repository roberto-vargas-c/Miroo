import Link from "next/link";
import { resetPassword } from "@/app/actions/auth";
import { peekToken } from "@/lib/auth/tokens";
import { ActionForm } from "@/components/ActionForm";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await peekToken(token, "RESET_PASSWORD");
  if (!t) {
    return (
      <div className="card w-full max-w-sm space-y-3 p-7 text-center">
        <h1 className="text-xl font-semibold">This link has expired</h1>
        <p className="text-sm text-slate-600">Reset links work once, for 1 hour.</p>
        <Link href="/forgot" className="btn-primary w-full">Send a new link</Link>
      </div>
    );
  }
  return (
    <div className="card w-full max-w-sm space-y-4 p-7">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="text-sm text-slate-600">For {t.user.email}. You'll be signed out on your other devices.</p>
      <ActionForm action={resetPassword.bind(null, token)} submit="Save password">
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Repeat it</label>
          <input className="input" id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </div>
      </ActionForm>
    </div>
  );
}
