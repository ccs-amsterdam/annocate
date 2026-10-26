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
