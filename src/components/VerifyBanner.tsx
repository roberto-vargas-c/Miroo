"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { resendVerification, type FormState } from "@/app/actions/auth";

export function VerifyBanner({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(() => resendVerification(), undefined);
  return (
    <form action={action} className="mb-6 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
      <MailCheck size={16} />
      <span className="flex-1">{state?.ok ?? `Please confirm your email address, ${email}. We sent you a link.`}</span>
      {!state?.ok && <button className="font-medium underline" disabled={pending}>Resend the link</button>}
    </form>
  );
}
