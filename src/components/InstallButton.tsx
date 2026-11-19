"use client";
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Install app" for phones and tablets: uses the browser's install prompt, or shows iOS steps. */
export function InstallButton({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    setInstalled(!!standalone);
    const ua = navigator.userAgent;
    setIos(/iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed || (!prompt && !ios)) return null;

  return (
    <>
      <button
        type="button"
        className={`btn-ghost justify-start whitespace-nowrap ${className}`}
        onClick={async () => {
          if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
          else setHelp(true);
        }}
      >
        <Download size={16} /> Install app
      </button>
      {help && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={() => setHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Install on your iPhone or iPad</h2>
              <button className="btn-ghost p-1" onClick={() => setHelp(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>Open this page in Safari.</li>
              <li>Tap <Share size={14} className="inline" /> Share in the toolbar.</li>
              <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
