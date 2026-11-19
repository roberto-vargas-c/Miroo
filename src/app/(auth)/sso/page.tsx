import Link from "next/link";
import { startSso } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";

export default async function SsoPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="card w-full max-w-sm space-y-4 p-7">
      <h1 className="text-xl font-semibold">Sign in with SSO</h1>
      <p className="text-sm text-slate-600">Enter your work email. We'll send you to your company's sign-in page.</p>
      <ActionForm action={startSso} submit="Continue">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@studio.com" />
        </div>
      </ActionForm>
      <p className="text-center text-sm"><Link className="font-medium text-brand-700" href="/login">Log in with a password</Link></p>
    </div>
  );
}
