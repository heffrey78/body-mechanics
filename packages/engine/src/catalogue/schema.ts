/**
 * The bundled exercise catalogue (#26, D3): curated exercises from wger plus our own, with the D1
 * fields the engine needs. Built by scripts/catalogue/build.ts from catalogue/curated.yaml.
 */
import { z } from "zod";
import { EQUIPMENT, KINDS, MEASURES, REGIONS } from "../records/vocab.ts";

export const CatalogueEntry = z.strictObject({
  id: z.string().regex(/^bm:[a-z0-9-]+$/),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  instructions: z.string(),
  measure: z.enum(MEASURES),
  sided: z.boolean(),
  works: z.array(z.enum(REGIONS)).min(1),
  strains: z.array(z.enum(REGIONS)),
  kinds: z.array(z.enum(KINDS)).min(1),
  sweat: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  equipment: z.array(z.enum(EQUIPMENT)),
  variationOf: z.string().regex(/^bm:[a-z0-9-]+$/).optional(),
  source: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("wger"), id: z.number().int(), url: z.url() }),
    z.strictObject({ kind: z.literal("own") }),
  ]),
  licence: z.strictObject({ name: z.string(), url: z.url() }),
  authors: z.array(z.string()),
  review: z.enum(["pending", "approved"]),
  notes: z.string().optional(),
});
export type CatalogueEntry = z.infer<typeof CatalogueEntry>;

export const Catalogue = z.strictObject({
  version: z.string(),
  builtFrom: z.string(),
  entries: z.array(CatalogueEntry),
});
export type Catalogue = z.infer<typeof Catalogue>;
