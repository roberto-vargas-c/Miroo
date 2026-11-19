"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";

/** A form wired to a server action that returns { error } or { ok }, showing whichever came back. */
export function ActionForm({
  action, submit, children, className = "space-y-4", hideOnOk = false,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submit: string;
  children?: React.ReactNode;
  className?: string;
  hideOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (hideOnOk && state?.ok) return <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">{state.ok}</p>;
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Working…" : submit}</button>
    </form>
  );
}
