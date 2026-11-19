export function Avatar({ name, color, size = 32, src }: { name: string; color: string; size?: number; src?: string | null }) {
  const initials = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} title={name} width={size} height={size}
        className="inline-block shrink-0 rounded-full object-cover ring-2 ring-white" style={{ width: size, height: size, background: color }} />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white"
      style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}
      title={name}
    >
      {initials}
    </span>
  );
}
