import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contrast of the shipped theme tokens (#23, #72, #17's validation metrics): every text colour against the
 * surfaces it sits on, in all ten theme and mode combinations, at least 4.5:1.
 */
const css = readFileSync(new URL("../src/theme/themes.css", import.meta.url), "utf8");

function luminance(hex: string): number {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const blocks = [...css.matchAll(/\[data-theme="(\w+)"\]\[data-mode="(\w+)"\] \{([^}]*)\}/g)].map(([, theme, mode, body]) => {
  const vars: Record<string, string> = {};
  for (const [, k, v] of body!.matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6});/g)) vars[k!] = v!;
  return { name: `${theme} ${mode}`, vars };
});

/** Text on its background, as the components use them. */
const PAIRS: [string, string][] = [
  ["ink", "bg"], ["ink", "surface"], ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"],
  ["accent-ink", "accent"], ["accent-text", "bg"], ["accent-text", "surface"], ["accent-soft-ink", "accent-soft"],
  ["warn-ink", "warn-soft"], ["stop-ink", "stop"], ["timer", "surface"],
  ["k-ink", "pain"], ["k-ink", "stiff"], ["k-ink", "weak"], ["inj-ink", "inj"], ["k-ink", "cond"],
  ["ink", "tint-1"], ["ink", "tint-2"],
];
/** Light modes: the cue sits on the card. Dark modes: on the dimmed exercise card, with everything else inside it (#73). */
const LIGHT_PAIRS: [string, string][] = [["cue", "surface"]];
const DARK_PAIRS: [string, string][] = [
  ["cue", "f-surface"], ["f-ink", "f-surface"], ["f-ink", "f-surface-2"], ["f-muted", "f-surface"], ["f-muted", "f-surface-2"],
  ["f-accent-ink", "f-accent"], ["f-accent-text", "f-surface"], ["f-accent-soft-ink", "f-accent-soft"], ["f-warn-ink", "f-warn-soft"],
  ["f-stop-ink", "f-stop"], ["f-timer", "f-surface"],
];

describe("theme contrast", () => {
  it("has all ten theme and mode combinations", () => {
    expect(blocks.map((b) => b.name).sort()).toEqual(
      ["fieldnotes", "handheld", "riso", "slate", "turquoise"].flatMap((t) => [`${t} dark`, `${t} light`]),
    );
  });

  for (const { name, vars } of blocks) {
    it(`${name}: every text pair is at least 4.5:1`, () => {
      const failing = [...PAIRS, ...(name.endsWith("dark") ? DARK_PAIRS : LIGHT_PAIRS)].filter(([fg, bg]) => {
        expect(vars[fg], `--${fg} in ${name}`).toBeDefined();
        expect(vars[bg], `--${bg} in ${name}`).toBeDefined();
        return ratio(vars[fg]!, vars[bg]!) < 4.5;
      }).map(([fg, bg]) => `${fg}/${bg} ${ratio(vars[fg]!, vars[bg]!).toFixed(2)}`);
      expect(failing).toEqual([]);
    });
  }
});
