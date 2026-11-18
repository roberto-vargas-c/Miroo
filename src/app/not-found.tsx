import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-slate-600">This page doesn't exist, or you don't have access to it.</p>
      <Link href="/w" className="btn-primary">Back to my boards</Link>
    </div>
  );
}
