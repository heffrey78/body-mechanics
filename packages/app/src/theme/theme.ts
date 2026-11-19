import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME, normaliseTheme, type ThemeChoice } from "./choice.ts";

export { THEMES, normaliseTheme, type ThemeChoice, type ThemeMode, type ThemeName } from "./choice.ts";

// Kept in the webview's storage until the profile record holds it (#27).
const KEY = "bm.theme";

function load(): ThemeChoice {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { name?: string; mode?: string } | null;
    return normaliseTheme(v);
  } catch {
    /* storage unavailable: the default */
  }
  return DEFAULT_THEME;
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
