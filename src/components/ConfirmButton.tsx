"use client";

import { useTransition } from "react";

export function ConfirmButton({
  action,
  message,
  className,
  children,
}: {
  action: () => Promise<unknown>;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        if (window.confirm(message)) start(() => void action());
      }}
    >
      {children}
    </button>
  );
}
