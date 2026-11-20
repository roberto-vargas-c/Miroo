"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "schema.theme";

/** Runs before the page paints so a dark-mode user never sees a light flash. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

/** True while dark mode is on; follows changes made anywhere on the page. */
export function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const upd = () => setDark(el.classList.contains("dark"));
    upd();
    const mo = new MutationObserver(upd);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function setDarkMode(on: boolean) {
  document.documentElement.classList.toggle("dark", on);
  try { localStorage.setItem(KEY, on ? "dark" : "light"); } catch { /* private mode */ }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useDarkMode();
  return (
    <button type="button" className={`btn-ghost justify-start whitespace-nowrap ${className}`} onClick={() => setDarkMode(!dark)}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}>
      {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
