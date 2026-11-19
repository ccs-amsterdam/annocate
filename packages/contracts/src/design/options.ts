import { z } from "zod";

// The options of a question (docs/client.md §4): a value, stored
// and used in conditions and exports, and a label, shown to the coder. The
// question's level decides the type of the values: strings for nominal
// questions (standardized terms, e.g. `human_interest`), numbers rising in
// the order of the options for ordinal ones.

export const OptionSchema = z.object({
  value: z
    .union([z.string(), z.number()])
    .describe("What is stored, compared and exported. Nominal: a string; ordinal: a number, rising in option order."),
  label: z.string().optional().describe("What the coder sees (default: the value). Can change without touching data."),
  color: z.string().optional().describe("Optional color, e.g. '#FF0000' or 'red'."),
});
export type Option = z.infer<typeof OptionSchema>;
export type OptionValue = Option["value"];

export const NominalOptionSchema = OptionSchema.extend({
  value: z
    .string({ error: "Nominal values are text (numbers rising in order: use an ordinal question)" })
    .describe("A standardized term, e.g. `human_interest`."),
});
export type NominalOption = z.infer<typeof NominalOptionSchema>;

/**
 * Whether two option values are the same code. Nominal values are strings,
 * but researchers with numeric codes write `.is(1)` for the value "1": a
 * number and a string are the same if the number written out is the string.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  return (
    a === b || (typeof a !== typeof b && (typeof a === "number" || typeof b === "number") && String(a) === String(b))
  );
}

/** Whether a string is a number written the plain way: "3", "-2", "1.5"; not "01", "1.0", "+3" or " 3". */
export function isPlainNumber(value: string): boolean {
  return value !== "" && Number.isFinite(Number(value)) && String(Number(value)) === value;
}

/**
 * Whether all option values of a question with text values (nominal, swipe)
 * are plain numbers, e.g. the codes of an existing codebook: they are
 * exported as numbers where a file has types (JSON). Leading zeros ("01")
 * keep the values text.
 */
export function hasNumericCodes(options: readonly { value: unknown }[] | undefined): boolean {
  return !!options?.length && options.every((o) => typeof o.value === "string" && isPlainNumber(o.value));
}

/** What the coder sees for an option. */
export function optionLabel(option: Pick<Option, "value" | "label">): string {
  return option.label ?? String(option.value);
}

/** Problems with nominal option values (non-empty, trimmed, unique strings). */
export function nominalValueErrors(options: { value: unknown }[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const { value } of options) {
    if (typeof value !== "string") errors.push(`Nominal values are strings, not ${JSON.stringify(value)}`);
    else if (value.trim() === "") errors.push("Values can't be empty");
    else if (value !== value.trim()) errors.push(`'${value}' has spaces around it`);
    else if (seen.has(value)) errors.push(`Duplicate value '${value}'`);
    if (typeof value === "string") seen.add(value);
  }
  return errors;
}

/** Problems with ordinal option values (numbers, rising in option order). */
export function ordinalValueErrors(options: { value: unknown }[]): string[] {
  const errors: string[] = [];
  let previous: number | null = null;
  for (const { value } of options) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`Ordinal values are numbers, not ${JSON.stringify(value)}`);
      continue;
    }
    if (previous !== null && value <= previous)
      errors.push(`Ordinal values must rise in the order of the options (${value} after ${previous})`);
    previous = value;
  }
  return errors;
}

const addErrors = (errors: string[], ctx: z.RefinementCtx) =>
  errors.forEach((message) => ctx.addIssue({ code: "custom", message }));

export const NominalOptionsSchema = z
  .array(NominalOptionSchema)
  .min(1, "At least one option is required")
  .superRefine((options, ctx) => addErrors(nominalValueErrors(options), ctx));

export const OrdinalOptionsSchema = z
  .array(OptionSchema)
  .min(1, "At least one option is required")
  .superRefine((options, ctx) => addErrors(ordinalValueErrors(options), ctx));

/** Swipe answering takes 2 or 3 options; their order is the direction: left, right, up. */
export const SwipeOptionsSchema = z
  .array(NominalOptionSchema)
  .min(2, "Swiping needs 2 or 3 options (left, right, up)")
  .max(3, "Swiping takes at most 3 options (left, right, up)")
  .superRefine((options, ctx) => addErrors(nominalValueErrors(options), ctx));

export const SWIPE_DIRECTIONS = ["left", "right", "up"] as const;

/**
 * A value proposed for a label (nominal questions): lower case, `_` for
 * spaces and punctuation, accents dropped. "Human interest" -> `human_interest`.
 */
export function valueFromLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * The options of a question switched to another level (§2): to ordinal,
 * numbered 1..n in their order (an old value becomes the label if there was
 * none); to nominal, values derived from the labels (made unique).
 */
export function convertOptionsLevel<T extends Option>(options: T[], level: "nominal" | "ordinal"): T[] {
  if (level === "ordinal") {
    return options.map((o, i) => ({ ...o, value: i + 1, label: o.label ?? String(o.value) }));
  }
  const used = new Set<string>();
  return options.map((o, i) => {
    const base = valueFromLabel(optionLabel(o)) || `option_${i + 1}`;
    let value = base;
    for (let n = 2; used.has(value); n++) value = `${base}_${n}`;
    used.add(value);
    return { ...o, value };
  });
}
