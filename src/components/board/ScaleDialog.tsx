"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PT_IN_METERS, TO_METERS, type Unit } from "@/lib/board/arch";
import type { ImageElement } from "@/lib/board/types";

/**
 * Set a real-world scale either from a line the user drew over a known dimension,
 * or (for PDF sheets) from the drawing's printed scale, e.g. 1:100.
 */
export function ScaleDialog({
  lengthPx, plan, unit, onSavePlan, onSaveBoard, onClose,
}: {
  lengthPx: number | null; // world px of the calibration line (null = opened from a plan's "Scale" button)
  plan: ImageElement | null;
  unit: Unit;
  onSavePlan: (plan: ImageElement, metersPerPx: number) => void;
  onSaveBoard: (metersPerPx: number) => void;
  onClose: () => void;
}) {
  const isPdf = !!plan?.plan?.paperWidthPt;
  const [mode, setMode] = useState<"length" | "ratio">(lengthPx ? "length" : "ratio");
  const [value, setValue] = useState("");
  const [u, setU] = useState<Unit | "in">(unit === "ft" ? "ft" : unit);
  const [ratio, setRatio] = useState("100");
  const [target, setTarget] = useState<"plan" | "board">(plan ? "plan" : "board");
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    let mpp: number;
    if (mode === "length") {
      const v = parseFloat(value.replace(",", "."));
      if (!lengthPx || !(v > 0)) return setErr("Enter the real length of the line you drew");
      mpp = (v * TO_METERS[u]) / lengthPx;
    } else {
      const n = parseFloat(ratio.replace(",", "."));
      if (!plan || !isPdf || !(n > 0)) return setErr("Enter the drawing scale, e.g. 100 for 1:100");
      // One world px = one PDF point at import width; a 1:n drawing means each point is n points in reality.
      mpp = (PT_IN_METERS * n * plan.plan!.paperWidthPt!) / plan.width;
    }
    if (target === "plan" && plan) onSavePlan(plan, mpp);
    else onSaveBoard(mpp);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form className="card w-full max-w-sm space-y-4 p-5" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Set scale</h2>
          <button type="button" className="btn-ghost p-1" onClick={onClose}><X size={18} /></button>
        </div>
        {isPdf && (
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            <button type="button" disabled={!lengthPx} className={`flex-1 rounded-md px-2 py-1 ${mode === "length" ? "bg-white shadow" : ""} disabled:opacity-40`} onClick={() => setMode("length")}>Known length</button>
            <button type="button" className={`flex-1 rounded-md px-2 py-1 ${mode === "ratio" ? "bg-white shadow" : ""}`} onClick={() => setMode("ratio")}>Drawing scale</button>
          </div>
        )}
        {mode === "length" ? (
          <div>
            <label className="label">The line you drew is really</label>
            <div className="flex gap-2">
              <input autoFocus className="input" inputMode="decimal" placeholder="e.g. 5.4" value={value} onChange={(e) => setValue(e.target.value)} />
              <select className="input w-auto" value={u} onChange={(e) => setU(e.target.value as Unit | "in")}>
                <option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option><option value="ft">ft</option><option value="in">in</option>
              </select>
            </div>
          </div>
        ) : (
          <div>
            <label className="label">The sheet is drawn at</label>
            <div className="flex items-center gap-2">
              <span className="text-lg">1 :</span>
              <input autoFocus className="input" inputMode="decimal" value={ratio} onChange={(e) => setRatio(e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-slate-500">Uses the PDF&apos;s paper size, so this works for sheets printed at their true size.</p>
          </div>
        )}
        <div>
          <span className="label">Apply to</span>
          <div className="space-y-1 text-sm">
            {plan && (
              <label className="flex items-center gap-2"><input type="radio" checked={target === "plan"} onChange={() => setTarget("plan")} />
                This plan ({plan.plan?.name ?? "image"}{plan.plan?.page ? `, page ${plan.plan.page}` : ""})</label>
            )}
            <label className="flex items-center gap-2"><input type="radio" checked={target === "board"} onChange={() => setTarget("board")} disabled={mode === "ratio"} />
              The whole board (anywhere without a scaled plan)</label>
          </div>
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">Save scale</button>
        </div>
      </form>
    </div>
  );
}
