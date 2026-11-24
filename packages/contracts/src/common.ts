import { z } from "zod";

/**
 * A "safe" identifier: alphanumeric + underscores only. Used for design
 * item names, unit field names, etc. Kept intentionally restrictive so names
 * can be used directly as object keys / variable identifiers on the client
 * (e.g. `unit.variables[sessionId][name]`) without escaping concerns.
 */
export const SafeNameSchema = z
  .string()
  .min(1)
  .max(64, "A name has at most 64 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Name must be alphanumeric and underscores only");

/** Numeric id, as assigned by a server implementation. */
export const IdSchema = z.number().int().positive();

/** Coder-supplied client-side id (e.g. for span/relation annotations). cuid-like opaque string. */
export const ClientIdSchema = z.string().min(1);

export const RoleSchema = z.enum(["ADMIN", "WRITE", "READ"] as const);
export type Role = z.infer<typeof RoleSchema>;

/**
 * One item of a `list` field (unitFields.ts): a word, or an option with a
 * label (and optionally its value and colour), e.g. the topics a unit can be
 * coded with.
 */
export const ListItemSchema = z.union([
  z.string(),
  z.object({ label: z.string(), value: z.string().optional(), color: z.string().optional() }).strict(),
]);
export type ListItem = z.infer<typeof ListItemSchema>;

/** One field's value; null is an empty value (e.g. an empty number cell in a CSV). See unitFields.ts. */
export const UnitDataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(ListItemSchema), z.null()]);
export type UnitDataValue = z.infer<typeof UnitDataValueSchema>;
export const UnitDataSchema = z.record(z.string(), UnitDataValueSchema);
export type UnitData = z.infer<typeof UnitDataSchema>;
