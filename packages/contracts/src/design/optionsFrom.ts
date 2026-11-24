import { z } from "zod";
import type { ListItem } from "../common.js";
import type { VariableValue } from "../variableValue.js";
import { valueFromLabel, type NominalOption } from "./options.js";
import { own } from "../common.js";

// Options from data (docs/client.md §4 "Options from data"): a category
// question can take options from the unit or from an earlier answer, in one
// row among its own options (`at`):
//
//   $unit.<field>   a list field: its items (words, or options with a label,
//                   value and colour); values from the labels if not given
//   $var.<question> an earlier span question of the unit: one option per span,
//                   its text as the label and the span's id as the value

export const OptionsFromSchema = z
  .strictObject({
    from: z
      .string()
      .regex(/^\$(unit|var)\.[A-Za-z_][A-Za-z0-9_]*$/, "Options come from $unit.<list field> or $var.<span question>")
      .describe("$unit.<list field> (its items) or $var.<span question> (its spans, the span id as value)."),
    at: z.number().int().min(0).optional().describe("Where among the question's own options (default: after them)."),
  })
  .strict();
export type OptionsFrom = z.infer<typeof OptionsFromSchema>;

/** The source of options from data: a unit field or a question, by name. */
export function optionsSource(from: string): { ns: "unit" | "var"; name: string } {
  const [ns, name] = from.slice(1).split(".");
  return { ns: ns as "unit" | "var", name };
}

/** What options from data are made of: the unit's data, the unit's answers so far, and the questions (for span colours). */
export interface OptionsContext {
  unit?: Record<string, unknown> | null;
  answers?: Record<string, VariableValue | undefined>;
  questions?: ReadonlyMap<string, { type: string; options?: { value: unknown; color?: string }[] }>;
}

/** A value not taken yet: `base`, else `base_2`, `base_3`, ... */
function unique(base: string, taken: Set<string>): string {
  let value = base || "option";
  for (let n = 2; taken.has(value); n++) value = `${base || "option"}_${n}`;
  taken.add(value);
  return value;
}

/** The options a source gives now (none while it has nothing, e.g. no spans yet). */
function sourceOptions(from: string, ctx: OptionsContext, taken: Set<string>): NominalOption[] {
  const { ns, name } = optionsSource(from);
  if (ns === "unit") {
    const list = own(ctx.unit, name);
    if (!Array.isArray(list)) return [];
    return (list as ListItem[]).map((item) => {
      const label = typeof item === "string" ? item : item.label;
      const given = typeof item === "string" ? undefined : item.value;
      const color = typeof item === "string" ? undefined : item.color;
      return {
        value: unique(given ?? valueFromLabel(label), taken),
        label,
        ...(color ? { color } : {}),
      };
    });
  }
  const spans = own(ctx.answers, name)?.spans ?? [];
  const labels = ctx.questions?.get(name)?.options ?? [];
  return spans.map((span) => {
    const color = labels.find((o) => o.value === span.value)?.color;
    taken.add(span.id);
    return {
      value: span.id,
      label: span.slices.map((s) => s.text).join(" … "),
      ...(color ? { color } : {}),
    };
  });
}

/** A question's options for a unit: its own, with the options from data in their place. */
export function resolveOptions(
  variable: { options: NominalOption[]; optionsFrom?: OptionsFrom },
  ctx: OptionsContext,
): NominalOption[] {
  if (!variable.optionsFrom) return variable.options;
  const taken = new Set(variable.options.map((o) => o.value));
  const added = sourceOptions(variable.optionsFrom.from, ctx, taken);
  const at = Math.min(variable.optionsFrom.at ?? variable.options.length, variable.options.length);
  return [...variable.options.slice(0, at), ...added, ...variable.options.slice(at)];
}

/** A question with its options resolved for a unit (as coders see it, and as answers are checked); others as they are. */
export function resolveVariable<T>(variable: T, ctx: OptionsContext): T {
  const v = variable as { type?: string; options?: NominalOption[]; optionsFrom?: OptionsFrom };
  if (v.type !== "nominal" || !v.optionsFrom || !v.options) return variable;
  const { optionsFrom: _from, ...rest } = v;
  void _from;
  return { ...rest, options: resolveOptions({ options: v.options, optionsFrom: v.optionsFrom }, ctx) } as T;
}
