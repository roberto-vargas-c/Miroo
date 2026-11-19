import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";

export default function ForgotPage() {
  return (
    <div className="card w-full max-w-sm space-y-4 p-7">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="text-sm text-slate-600">Enter your email and we'll send you a link to choose a new password.</p>
      <ActionForm action={requestPasswordReset} submit="Send reset link" hideOnOk>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" autoFocus />
        </div>
      </ActionForm>
      <p className="text-center text-sm"><Link className="font-medium text-brand-700" href="/login">Back to log in</Link></p>
    </div>
  );
}
