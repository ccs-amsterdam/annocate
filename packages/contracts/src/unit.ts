import { z } from "zod";
import { IdSchema, UnitDataSchema } from "./common";
import { VariableValueSchema } from "./variableValue";

/** Full unit as returned by the server. */
export const UnitResponseSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  data: UnitDataSchema,
  /** Once true (any coder has recorded variables, or it's used by a deployed codebook), the unit's `data` can no longer change. */
  immutable: z.boolean(),
});
export type UnitResponse = z.infer<typeof UnitResponseSchema>;

/** Lightweight listing entry, e.g. for `GET /units` sync checks. */
export const UnitMetaSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  /** A content hash, so a client can detect whether a cached copy is stale. */
  hash: z.string(),
});
export type UnitMeta = z.infer<typeof UnitMetaSchema>;

export const UnitCreateSchema = z.object({
  externalId: z.string().min(1),
  data: UnitDataSchema,
});

/** Body for `POST /units` -- bulk create. */
export const UnitsCreateBodySchema = z.object({
  overwrite: z.boolean().optional(),
  units: z.array(UnitCreateSchema).max(200),
});

/**
 * A unit as delivered to a coder mid-annotation: includes this coder's
 * existing variable values for the unit (so the client can resume/show
 * prior answers), but never other coders' data.
 */
export const CoderUnitResponseSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  data: UnitDataSchema,
  variables: z.record(z.string(), VariableValueSchema),
});
export type CoderUnitResponse = z.infer<typeof CoderUnitResponseSchema>;
