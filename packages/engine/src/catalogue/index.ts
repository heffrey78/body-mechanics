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
