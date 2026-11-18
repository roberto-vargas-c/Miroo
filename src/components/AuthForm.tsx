"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "signup";
  action: (s: FormState, f: FormData) => Promise<FormState>;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <form action={formAction} className="card w-full max-w-sm space-y-4 p-7">
      <h1 className="text-xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" required autoComplete="name" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </div>
      {state?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{mode === "login" ? "Log in" : "Sign up"}</button>
      <p className="text-center text-sm text-slate-600">
        {mode === "login" ? (
          <>No account? <Link className="font-medium text-brand-700" href={`/signup${q}`}>Sign up</Link></>
        ) : (
          <>Already have one? <Link className="font-medium text-brand-700" href={`/login${q}`}>Log in</Link></>
        )}
      </p>
    </form>
  );
}
