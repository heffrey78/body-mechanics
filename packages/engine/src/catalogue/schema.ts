/**
 * The bundled exercise catalogue (#26, D3): curated exercises from wger plus our own, with the D1
 * fields the engine needs. Built by scripts/catalogue/build.ts from catalogue/curated.yaml.
 */
import { z } from "zod";
import { EQUIPMENT, KINDS, MARK_KINDS, MEASURES, REGIONS, modifierInfo } from "../records/vocab.ts";

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

const exId = z.string().regex(/^bm:[a-z0-9-]+$/);
const modifierId = z.string().refine((m) => !!modifierInfo(m), { message: "not in the modifier vocabulary" });

/** The body rules (#46): built from catalogue/rules.yaml, used by the engine (#47). */
export const BodyRules = z.strictObject({
  review: z.enum(["pending", "approved"]),
  /** What to suggest for a mark on a region, best first. */
  helps: z.array(z.strictObject({ region: z.enum(REGIONS), marks: z.array(z.enum(MARK_KINDS)).min(1), exercises: z.array(exId).min(1) })),
  /** An exercise's own change for a mild mark on a region it strains. */
  modify: z.array(z.strictObject({ exercise: exId, region: z.enum(REGIONS), swap: exId.optional(), modifiers: z.array(modifierId).default([]) })),
  /** The modifiers for a mild mark on a region, when the exercise has no rule of its own. */
  defaults: z.record(z.enum(REGIONS), z.array(modifierId)),
  conditions: z.array(z.strictObject({
    kind: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    regions: z.array(z.enum(REGIONS)),
    avoid: z.array(exId),
    helps: z.array(exId),
  })),
});
export type BodyRules = z.infer<typeof BodyRules>;

export const Catalogue = z.strictObject({
  version: z.string(),
  builtFrom: z.string(),
  entries: z.array(CatalogueEntry),
  rules: BodyRules,
});
export type Catalogue = z.infer<typeof Catalogue>;
