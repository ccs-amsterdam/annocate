import { z } from "zod";

/** A name: a letter, then letters, digits and underscores. */
export const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const MAX_NAME_LENGTH = 64;

/** Names every JavaScript object has a meaning for: as a key they would read or change the object itself. */
const RESERVED_NAMES: readonly string[] = ["__proto__", "constructor", "prototype"];

/** Whether objects have a meaning of their own for this key (`constructor`, `__proto__`, `prototype`). */
export const isReservedName = (name: string): boolean => RESERVED_NAMES.includes(name);

const NAME_TOO_LONG = `a name has at most ${MAX_NAME_LENGTH} characters`;
const NAME_SHAPE = "a name starts with a letter, then letters, digits and _";
const sentence = (text: string) => text[0].toUpperCase() + text.slice(1);

/**
 * Why a text can't be a name, or null if it can. Names (of questions and
 * other design items, scale items, URL parameters, snippets, blocks) are
 * written in scripts (`$var.<name>`) and are keys of objects and columns of
 * exports: a letter first, then letters, digits and underscores, at most 64
 * characters, and not a name objects have themselves.
 */
export function nameError(name: string): string | null {
  if (name.length > MAX_NAME_LENGTH) return NAME_TOO_LONG;
  if (!NAME_PATTERN.test(name)) return NAME_SHAPE;
  if (isReservedName(name)) return `'${name}' can't be used as a name`;
  return null;
}

/** A name (see `nameError`). */
export const SafeNameSchema = z
  .string()
  .max(MAX_NAME_LENGTH, sentence(NAME_TOO_LONG))
  .regex(NAME_PATTERN, sentence(NAME_SHAPE))
  .refine((name) => !isReservedName(name), { error: (issue) => `'${String(issue.input)}' can't be used as a name` });

/**
 * `record[key]`, if the record itself has it. For keys that come from a
 * design, a unit or a request: a plain object also answers to `toString`,
 * `constructor` and the other names of `Object.prototype`.
 */
export function own<T>(record: Readonly<Record<string, T>> | null | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Numeric id, as assigned by a server implementation. */
export const IdSchema = z.number().int().positive();

/** Coder-supplied client-side id (e.g. for span/relation annotations). cuid-like opaque string. */
export const ClientIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "An id is letters, digits, _ and -");

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
