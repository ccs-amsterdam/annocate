import { z } from "zod";
import type { UnitData, UnitDataValue } from "./common.js";

/**
 * A job's unit fields (docs/client.md §7, "Units"): every unit has the
 * same fields, each with a type. The server takes them from the first
 * upload (`fieldsOfUnits`) and checks later uploads against them
 * (`checkUnitData`); deleting all units resets them. Values are stored typed,
 * so `{{$unit.count > 40}}` compares numbers. `null` is an empty value of
 * any type.
 */
export const UnitFieldTypeSchema = z.enum(["text", "number", "boolean"]);
export type UnitFieldType = z.infer<typeof UnitFieldTypeSchema>;

export const UnitFieldSchema = z.object({
  name: z.string().min(1).max(128),
  type: UnitFieldTypeSchema,
});
export type UnitField = z.infer<typeof UnitFieldSchema>;

/**
 * What a new field may be called: letters, digits and underscores, not
 * starting with a digit, so codebooks can refer to it as `$unit.<name>`.
 * (Fields of older jobs may have other names.)
 */
export const UNIT_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why a name can't be a new field's name, or null if it can. */
export function unitFieldNameError(name: string): string | null {
  if (name.length > 64) return "at most 64 characters";
  if (!UNIT_FIELD_NAME.test(name)) return "only letters, digits and _, not starting with a digit";
  return null;
}

/**
 * A valid field name for a column header: other characters become `_`
 * (accents dropped), lowercase; `field` if nothing is left, `_` in front of
 * a leading digit; and `_2`, `_3`, ... if `taken` has it.
 */
export function toUnitFieldName(header: string, taken: ReadonlySet<string> = new Set()): string {
  let name = header
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  if (name === "") name = "field";
  if (/^[0-9]/.test(name)) name = `_${name}`;
  let unique = name;
  for (let n = 2; taken.has(unique); n++) unique = `${name}_${n}`;
  return unique;
}

/** The type of a stored value; null for an empty value (fits every type). */
export function typeOfValue(value: UnitDataValue): UnitFieldType | null {
  if (value === null) return null;
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

/**
 * The fields of a first upload: every key that occurs, in order of first
 * occurrence, typed by its non-empty values (text if all are empty).
 * An error if a field mixes types.
 */
export function fieldsOfUnits(units: UnitData[]): { fields: UnitField[] } | { error: string } {
  const types = new Map<string, UnitFieldType | null>();
  for (const data of units) {
    for (const [name, value] of Object.entries(data)) {
      const type = typeOfValue(value);
      const known = types.get(name);
      if (known === undefined || known === null) types.set(name, type);
      else if (type !== null && type !== known) {
        return { error: `Field '${name}' mixes ${known} and ${type} values` };
      }
    }
  }
  return { fields: [...types].map(([name, type]) => ({ name, type: type ?? "text" })) };
}

/**
 * The fields a later upload adds: keys that aren't fields yet, typed by
 * their values (as `fieldsOfUnits`), each with a valid name. Units already
 * stored have no value for them (as if empty).
 */
export function addedFields(units: UnitData[], fields: UnitField[]): { fields: UnitField[] } | { error: string } {
  const known = new Set(fields.map((f) => f.name));
  const added = fieldsOfUnits(units.map((data) => Object.fromEntries(Object.entries(data).filter(([name]) => !known.has(name)))));
  if ("error" in added) return added;
  for (const field of added.fields) {
    const problem = unitFieldNameError(field.name);
    if (problem) return { error: `Field name '${field.name}': ${problem}` };
  }
  return added;
}

/** Why a unit's data doesn't fit the job's fields, or null if it does: the same fields, with fitting values. */
export function checkUnitData(data: UnitData, fields: UnitField[]): string | null {
  const known = new Map(fields.map((f) => [f.name, f.type]));
  for (const [name, value] of Object.entries(data)) {
    const type = known.get(name);
    if (type === undefined) return `Unknown field '${name}' (the fields are: ${fields.map((f) => f.name).join(", ")})`;
    const actual = typeOfValue(value);
    if (actual !== null && actual !== type) return `Field '${name}' is ${type}, got ${actual} (${JSON.stringify(value)})`;
  }
  const missing = fields.find((f) => !(f.name in data));
  return missing ? `Missing field '${missing.name}'` : null;
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const BOOLEAN = /^(true|false)$/i;

/**
 * The type of a text column (e.g. from a CSV): number if every non-empty
 * value is a number, boolean if every one is true/false, else text.
 */
export function inferFieldType(values: string[]): UnitFieldType {
  const filled = values.map((v) => v.trim()).filter((v) => v !== "");
  if (filled.length === 0) return "text";
  if (filled.every((v) => NUMBER.test(v))) return "number";
  if (filled.every((v) => BOOLEAN.test(v))) return "boolean";
  return "text";
}

/**
 * A text value (e.g. a CSV cell) as a value of this type: a number or
 * boolean, or null if empty. Text stays as is. Undefined if it doesn't parse.
 */
export function parseFieldValue(raw: string, type: UnitFieldType): UnitDataValue | undefined {
  if (type === "text") return raw;
  const value = raw.trim();
  if (value === "") return null;
  if (type === "number") return NUMBER.test(value) ? Number(value) : undefined;
  return BOOLEAN.test(value) ? value.toLowerCase() === "true" : undefined;
}
