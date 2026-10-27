import { z } from "zod";
import { IdSchema, UnitDataSchema } from "./common.js";
import { VariableValueSchema } from "./variableValue.js";

/** Full unit as returned by the server. */
export const UnitResponseSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  data: UnitDataSchema,
  /**
   * A coder answered about this unit. It can still be replaced (with
   * `overwriteCoded`): what coders saw is kept as unit versions.
   */
  coded: z.boolean(),
});
export type UnitResponse = z.infer<typeof UnitResponseSchema>;

/** `GET /units/page`: one page of units with their data, and how many there are in all. */
export const UnitPageSchema = z.object({
  total: z.number().int().nonnegative(),
  units: z.array(UnitResponseSchema),
});
export type UnitPage = z.infer<typeof UnitPageSchema>;

/** Lightweight listing entry, e.g. for `GET /units` sync checks. */
export const UnitMetaSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  /** A content hash, so a client can detect whether a cached copy is stale. */
  hash: z.string(),
  /** A coder answered about this unit (see `UnitResponseSchema`). */
  coded: z.boolean(),
});
export type UnitMeta = z.infer<typeof UnitMetaSchema>;

export const UnitCreateSchema = z.object({
  externalId: z.string().min(1),
  data: UnitDataSchema,
});
export type UnitCreate = z.infer<typeof UnitCreateSchema>;

/** Body for `POST /units` -- bulk create. */
export const UnitsCreateBodySchema = z.object({
  /** Replace units with the same external id (not coded ones, unless `overwriteCoded`). */
  overwrite: z.boolean().optional(),
  /**
   * Also replace units that were coded. Their answers stay, pointing to the
   * unit version their coder saw; spans may no longer fit the new text.
   */
  overwriteCoded: z.boolean().optional(),
  units: z.array(UnitCreateSchema).max(200),
});
export type UnitsCreateBody = z.infer<typeof UnitsCreateBodySchema>;

/**
 * A unit as delivered to a coder mid-annotation: includes this coder's
 * existing variable values for the unit (so the client can resume/show
 * prior answers), but never other coders' data.
 */
export const CoderUnitResponseSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  /** Only the fields the codebook uses (`shownUnitFields`). */
  data: UnitDataSchema,
  variables: z.record(z.string(), VariableValueSchema),
});
export type CoderUnitResponse = z.infer<typeof CoderUnitResponseSchema>;
