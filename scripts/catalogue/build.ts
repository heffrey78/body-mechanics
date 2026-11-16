/**
 * Builds the bundled catalogue (#26, D3): catalogue/curated.yaml (the exercises and their reviewed
 * tags) + wger's data (names' sources, instructions, aliases, licence and authors) + catalogue/own.yaml
 * (our own exercises' instructions) → packages/engine/src/catalogue/catalogue.json and CREDITS.md.
 *
 *   node scripts/catalogue/build.ts            # wger from catalogue/.cache/wger.json, fetched if missing
 *   node scripts/catalogue/build.ts --fetch    # fetch wger afresh
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";
import { Catalogue, CatalogueEntry } from "../../packages/engine/src/catalogue/schema.ts";

const CACHE = "catalogue/.cache/wger.json";
const WGER = "https://wger.de/api/v2/exerciseinfo/?limit=1000&format=json";
const OWN_LICENCE = { name: "CC-BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" };

interface WgerTranslation { language: number; name: string; description: string; aliases?: { alias: string }[] }
interface WgerExercise {
  id: number;
  translations: WgerTranslation[];
  license: { short_name: string; url: string };
  license_author: string | null;
  author_history?: string[];
}

async function wger(): Promise<Map<number, WgerExercise>> {
  if (process.argv.includes("--fetch") || !existsSync(CACHE)) {
    console.log(`Fetching ${WGER}`);
    const res = await fetch(WGER, { headers: { "User-Agent": "body-mechanics catalogue build" } });
    if (!res.ok) throw new Error(`wger answered ${res.status}`);
    mkdirSync("catalogue/.cache", { recursive: true });
    writeFileSync(CACHE, await res.text());
  }
  const data = JSON.parse(readFileSync(CACHE, "utf8")) as { results: WgerExercise[] };
  return new Map(data.results.map((e) => [e.id, e]));
}

/** wger's HTML descriptions as plain text. */
function plain(html: string): string {
  return html
    .replace(/<\/(p|li|ol|ul|h\d)>/g, "\n").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

type Curated = Omit<CatalogueEntry, "aliases" | "instructions" | "source" | "licence" | "authors"> & { source: string; aliases?: string[] };

const curated = parse(readFileSync("catalogue/curated.yaml", "utf8")) as Curated[];
const own = parse(readFileSync("catalogue/own.yaml", "utf8")) as Record<string, string>;
const source = await wger();

const problems: string[] = [];
const entries: CatalogueEntry[] = [];
const seen = new Set<string>();
for (const c of curated) {
  if (seen.has(c.id)) problems.push(`${c.id}: listed twice`);
  seen.add(c.id);
  const { source: from, aliases = [], ...tags } = c;
  let entry: unknown;
  if (from === "own") {
    const instructions = own[c.id];
    if (!instructions) problems.push(`${c.id}: no instructions in own.yaml`);
    entry = { ...tags, aliases, instructions: instructions ?? "", source: { kind: "own" }, licence: OWN_LICENCE, authors: ["Body Mechanics"] };
  } else {
    const id = Number(from.replace(/^wger:/, ""));
    const w = source.get(id);
    const en = w?.translations.find((t) => t.language === 2);
    if (!w || !en) {
      problems.push(`${c.id}: wger ${id} not found, or not in English`);
      continue;
    }
    // wger keeps left and right copies of some exercises: one-sidedness is our `sided`, not a name.
    const unsided = (n: string) => n.trim().replace(/^(left|right)\s+/i, "").replace(/[\s,]+(left|right)(\s+(leg|arm|side))?$/i, "").trim();
    const names = [en.name, ...(en.aliases ?? []).map((a) => a.alias)].map(unsided).filter((n) => n && n.toLowerCase() !== c.name.toLowerCase());
    const named = [...new Set([w.license_author, ...(w.author_history ?? [])].filter((a): a is string => !!a))];
    const authors = named.length ? named : ["wger contributors"];
    entry = {
      ...tags,
      aliases: [...new Set([...aliases, ...names])],
      // Our own words where wger's are missing or too thin (own.yaml), credited as such.
      instructions: own[c.id] ?? plain(en.description ?? ""),
      source: { kind: "wger", id, url: `https://wger.de/en/exercise/${id}/view/` },
      licence: { name: w.license.short_name, url: w.license.url },
      authors,
    };
  }
  const checked = CatalogueEntry.safeParse(entry);
  if (!checked.success) problems.push(...checked.error.issues.map((i) => `${c.id}.${i.path.join(".")}: ${i.message}`));
  else entries.push(checked.data);
}
for (const e of entries) {
  if (!e.instructions.trim()) problems.push(`${e.id}: no instructions (add some to own.yaml)`);
  if (e.variationOf && !seen.has(e.variationOf)) problems.push(`${e.id}: variationOf ${e.variationOf} isn't in the catalogue`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const catalogue = Catalogue.parse({ version: "1", builtFrom: `wger exerciseinfo, ${new Date().toISOString().slice(0, 10)}`, entries });
writeFileSync("packages/engine/src/catalogue/catalogue.json", JSON.stringify(catalogue, null, 1) + "\n");

const credits = [
  "# Exercise catalogue credits",
  "",
  "The catalogue (packages/engine/src/catalogue/catalogue.json) is published under CC-BY-SA 4.0. Exercises from",
  "[wger](https://wger.de) keep their own licences and authors, listed here; the app's code has its own licence (D3).",
  "",
  "| Exercise | Source | Licence | Authors |",
  "|---|---|---|---|",
  ...entries.map((e) => `| ${e.name} | ${e.source.kind === "wger" ? `[wger ${e.source.id}](${e.source.url})` : "Body Mechanics"} | ${e.licence.name} | ${e.authors.join(", ") || "-"} |`),
  "",
].join("\n");
writeFileSync("catalogue/CREDITS.md", credits);
const pending = entries.filter((e) => e.review === "pending").length;
console.log(`${entries.length} exercises (${entries.filter((e) => e.source.kind === "own").length} our own); ${pending} awaiting the owner's review.`);
