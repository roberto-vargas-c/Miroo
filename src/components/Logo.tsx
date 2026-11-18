import { PRODUCT_NAME } from "@/lib/brand";

export function LogoMark({ size = 28 }: { size?: number }) {
  // Three overlapping rounded squares: notes on a canvas.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="2" y="8" width="16" height="16" rx="4" fill="#14a38b" />
      <rect x="9" y="4" width="16" height="16" rx="4" fill="#0d6b5e" opacity="0.85" />
      <rect x="14" y="12" width="16" height="16" rx="4" fill="#f59e0b" opacity="0.9" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight">
      <LogoMark /> {PRODUCT_NAME}
    </span>
  );
}
