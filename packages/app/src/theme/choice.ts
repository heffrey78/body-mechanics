// The themes on offer and the stored-choice migration (#72): pure, so tests can load it without a page.

export const THEMES = [
  { id: "fieldnotes", label: "Field Notes", blurb: "Warm paper and navy ink, with an orange marker", swatch: ["#F6F2EA", "#1F2A44", "#C2410C"] },
  { id: "slate", label: "Slate", blurb: "Graphite and stone, with signal red", swatch: ["#F3F2EF", "#33414F", "#D9483B"] },
  { id: "turquoise", label: "Turquoise", blurb: "Deep blue-teal, coral and peach", swatch: ["#F4FAF9", "#194350", "#FF8882"] },
  { id: "riso", label: "Riso", blurb: "Two inks, pink and blue, on paper", swatch: ["#F8F5EE", "#0078BF", "#FF48B0"] },
  { id: "handheld", label: "Handheld", blurb: "Sea green, mint and hot pink, like a toy console", swatch: ["#EEFFF4", "#64BEA4", "#F30654"] },
] as const;
export type ThemeName = (typeof THEMES)[number]["id"];
export type ThemeMode = "system" | "light" | "dark";
export interface ThemeChoice { name: ThemeName; mode: ThemeMode }

export const DEFAULT_THEME: ThemeChoice = { name: "fieldnotes", mode: "system" };

/** A stored choice as a current one (#72): a theme no longer offered (Clinic, Studio, Utility, or anything
 *  unknown) becomes Field Notes, keeping the stored light or dark mode. */
export function normaliseTheme(v: { name?: string; mode?: string } | null | undefined): ThemeChoice {
  const name = THEMES.find((t) => t.id === v?.name)?.id ?? DEFAULT_THEME.name;
  const mode = (["system", "light", "dark"] as const).find((m) => m === v?.mode) ?? DEFAULT_THEME.mode;
  return { name, mode };
}
