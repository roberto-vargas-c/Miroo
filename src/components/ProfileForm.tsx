"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";

const COLORS = ["#0ea5a4", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0f766e", "#475569"];

/** Shrinks a picture to a 256 px square (center crop) and encodes it as WebP (JPEG where WebP isn't available). */
async function squareAvatar(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close();
  let b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.86));
  if (!b || b.type !== "image/webp") b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
  if (!b) throw new Error("Couldn't read that picture");
  return b;
}

export function ProfileForm({ user }: { user: { name: string; email: string; color: string; avatar: string | null } }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color);
  const [avatar, setAvatar] = useState(user.avatar);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/me/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, color }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: (await r.json().catch(() => ({}))).error ?? "Couldn't save" }); return; }
    setMsg({ ok: true, text: "Saved" });
    router.refresh();
  };
  const upload = async (f: File) => {
    setBusy(true); setMsg(null);
    try {
      const blob = await squareAvatar(f);
      const r = await fetch("/api/me/avatar", { method: "POST", headers: { "content-type": blob.type }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Upload failed");
      setAvatar(j.url);
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Upload failed" });
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    await fetch("/api/me/avatar", { method: "DELETE" });
    setAvatar(null); setBusy(false);
    router.refresh();
  };

  return (
    <form onSubmit={save} className="card space-y-5 p-6">
      <div className="flex items-center gap-4">
        <button type="button" className="group relative rounded-full" onClick={() => fileRef.current?.click()} title="Change picture">
          <Avatar name={name || "?"} color={color} size={80} src={avatar} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
            <Camera size={22} />
          </span>
        </button>
        <div className="flex flex-col items-start gap-1">
          <button type="button" className="btn-outline py-1.5 text-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Camera size={15} /> {avatar ? "Change picture" : "Add a picture"}
          </button>
          {avatar && <button type="button" className="btn-ghost py-1 text-sm text-rose-600" onClick={remove} disabled={busy}><Trash2 size={14} /> Remove</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </div>
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </div>
      <div>
        <span className="label">Email</span>
        <p className="text-sm text-slate-600">{user.email}</p>
      </div>
      <div>
        <span className="label">Color</span>
        <p className="mb-2 text-xs text-slate-500">Used for your cursor and initials on boards.</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} title={c}
              className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-brand-500 ring-offset-2" : ""}`} style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !name.trim()}>Save</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
