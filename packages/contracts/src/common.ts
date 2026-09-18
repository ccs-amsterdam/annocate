import { z } from "zod";

/**
 * A "safe" identifier: alphanumeric + underscores only. Used for codebook
 * item names, unit field names, etc. Kept intentionally restrictive so names
 * can be used directly as object keys / variable identifiers on the client
 * (e.g. `unit.variables[coderId][name]`) without escaping concerns.
 */
export const SafeNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_]+$/, "Name must be alphanumeric and underscores only");

/** Numeric id, as assigned by a server implementation. */
export const IdSchema = z.number().int().positive();

/** Coder-supplied client-side id (e.g. for span/relation annotations). cuid-like opaque string. */
export const ClientIdSchema = z.string().min(1);

export const RoleSchema = z.enum(["ADMIN", "WRITE", "READ"] as const);
export type Role = z.infer<typeof RoleSchema>;

/** An inline CSS properties object, e.g. `{ fontSize: "1.3em" }`. */
export const StyleSchema = z.record(z.string(), z.string());

export const UnitDataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const UnitDataSchema = z.record(z.string(), UnitDataValueSchema);
export type UnitData = z.infer<typeof UnitDataSchema>;
