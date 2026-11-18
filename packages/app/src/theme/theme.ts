import { useCallback, useEffect, useState } from "react";

export const THEMES = [
  { id: "clinic", label: "Clinic", blurb: "Calm, cool and precise" },
  { id: "studio", label: "Studio", blurb: "Warm, athletic and rounded" },
  { id: "utility", label: "Utility", blurb: "High contrast, gym-floor legible" },
] as const;
export type ThemeName = (typeof THEMES)[number]["id"];
export type ThemeMode = "system" | "light" | "dark";
export interface ThemeChoice { name: ThemeName; mode: ThemeMode }

const DEFAULT: ThemeChoice = { name: "clinic", mode: "system" };
// Kept in the webview's storage until the profile record holds it (#27).
const KEY = "bm.theme";

function load(): ThemeChoice {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ThemeChoice> | null;
    if (v && THEMES.some((t) => t.id === v.name) && ["system", "light", "dark"].includes(v.mode ?? "")) return v as ThemeChoice;
  } catch {
    /* storage unavailable: the default */
  }
  return DEFAULT;
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Sets the theme's tokens on <html>: data-theme, and data-mode with "system" resolved to light or dark. */
export function applyTheme({ name, mode }: ThemeChoice): void {
  const resolved = mode === "system" ? (darkQuery().matches ? "dark" : "light") : mode;
  document.documentElement.dataset["theme"] = name;
  document.documentElement.dataset["mode"] = resolved;
}

/** The current theme, applied at once on every change, and following the system while mode is "system". */
export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState(load);
  useEffect(() => {
    applyTheme(choice);
    if (choice.mode !== "system") return;
    const q = darkQuery();
    const follow = () => applyTheme(choice);
    q.addEventListener("change", follow);
    return () => q.removeEventListener("change", follow);
  }, [choice]);
  const set = useCallback((c: ThemeChoice) => {
    setChoice(c);
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch {
      /* not kept: still applied */
    }
  }, []);
  return [choice, set];
}

// Before React renders, so the first paint is already in the right theme.
applyTheme(load());
