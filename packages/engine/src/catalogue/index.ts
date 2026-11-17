import data from "./catalogue.json" with { type: "json" };
import { Catalogue, type CatalogueEntry } from "./schema.ts";

export { Catalogue, CatalogueEntry } from "./schema.ts";

let loaded: Catalogue | undefined;

/** The bundled catalogue (#26), checked once on first use. */
export function catalogue(): Catalogue {
  return (loaded ??= Catalogue.parse(data));
}

export function catalogueEntry(id: string): CatalogueEntry | undefined {
  return catalogue().entries.find((e) => e.id === id);
}

export { BodyRules } from "./schema.ts";

/** The body rules (#46): what helps a mark, how to modify for a mild one, and the condition types. */
export function bodyRules(): Catalogue["rules"] {
  return catalogue().rules;
}
