"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";

type W = { id: string; name: string };

export function WorkspaceSwitcher({ current, all }: { current: W; all: W[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn-outline w-full justify-between">
        <span className="truncate">{current.name}</span>
        <ChevronsUpDown size={14} />
      </button>
      {open && (
        <div className="card absolute z-20 mt-1 w-full p-1" onMouseLeave={() => setOpen(false)}>
          {all.map((w) => (
            <Link key={w.id} href={`/w/${w.id}`} className="btn-ghost w-full justify-between" onClick={() => setOpen(false)}>
              <span className="truncate">{w.name}</span>
              {w.id === current.id && <Check size={14} />}
            </Link>
          ))}
          <Link href="/w/new" className="btn-ghost w-full justify-start text-brand-700"><Plus size={14} /> New workspace</Link>
        </div>
      )}
    </div>
  );
}
