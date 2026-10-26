import { z } from "zod";
import { parseReference, referenceValue, type ReferenceScope } from "./references.js";

// One condition model, used by `condition` items and unit-loop branch `when`
// (docs/client.md "References and conditions"). Every condition is evaluated
// on the client: rules here (no JS engine needed), scripts in the client's
// QuickJS sandbox.

export const CONDITION_OPS = ["is", "isnot", "gt", "gte", "lt", "lte"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];
export const NUMERIC_OPS: readonly ConditionOp[] = ["gt", "gte", "lt", "lte"];

const RuleScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

export const ConditionRuleSchema = z.object({
  /** One reference, e.g. `$var.experience.code`, `$var.interest.tech.value`, `$unit.source`. */
  ref: z.string().min(1),
  /**
   * `is`/`isnot`: equals / differs (for array refs such as multi-select and
   * spans: contains / doesn't contain). `gt`..`lte` need a numeric ref.
   */
  op: z.enum(CONDITION_OPS),
  /** With `is`/`isnot`, an array means "any of" / "none of". */
  value: z.union([RuleScalarSchema, z.array(z.union([z.string(), z.number()])).min(1)]),
});
export type ConditionRule = z.infer<typeof ConditionRuleSchema>;

export const RulesConditionSchema = z
  .object({
    /** Default `all`. */
    match: z.enum(["all", "any"]).optional(),
    rules: z.array(ConditionRuleSchema),
  })
  .strict();
export type RulesCondition = z.infer<typeof RulesConditionSchema>;

export const ScriptConditionSchema = z
  .object({
    /** A JS expression over `$unit`, `$var` and `$const`; truthy = shown / matches. */
    script: z.string(),
  })
  .strict();
export type ScriptCondition = z.infer<typeof ScriptConditionSchema>;

export const ConditionSchema = z.union([RulesConditionSchema, ScriptConditionSchema]);
export type Condition = z.infer<typeof ConditionSchema>;

export function isScriptCondition(condition: Condition): condition is ScriptCondition {
  return "script" in condition;
}

function same(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return a === b || String(a) === String(b);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Whether one rule holds in a scope. An invalid ref never holds. */
export function evaluateRule(rule: ConditionRule, scope: ReferenceScope): boolean {
  const parsed = parseReference(rule.ref);
  if ("error" in parsed) return false;
  const actual = referenceValue(scope, parsed.ref);
  const expected = Array.isArray(rule.value) ? rule.value : [rule.value];

  if (rule.op === "is" || rule.op === "isnot") {
    const hit = Array.isArray(actual)
      ? expected.some((e) => actual.some((a) => same(a, e)))
      : expected.some((e) => same(actual, e));
    return rule.op === "is" ? hit : !hit;
  }
  if (Array.isArray(actual) || Array.isArray(rule.value)) return false;
  const a = toNumber(actual);
  const b = toNumber(rule.value);
  if (a === null || b === null) return false;
  switch (rule.op) {
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
  }
}

/** Evaluates a rules condition (no rules: always true). */
export function evaluateRules(condition: RulesCondition, scope: ReferenceScope): boolean {
  if (condition.rules.length === 0) return true;
  return condition.match === "any"
    ? condition.rules.some((r) => evaluateRule(r, scope))
    : condition.rules.every((r) => evaluateRule(r, scope));
}

/**
 * The script equivalent of a rules condition (for switching an editor from
 * rules to script). `isArray` says which refs hold arrays (multi-select,
 * spans), since `is` means "contains" for those.
 */
export function rulesToScript(condition: RulesCondition, isArray: (ref: string) => boolean = () => false): string {
  if (condition.rules.length === 0) return "true";
  const parts = condition.rules.map((rule) => {
    const ref = rule.ref.trim();
    const values = Array.isArray(rule.value) ? rule.value : [rule.value];
    const literal = (v: unknown) => JSON.stringify(v);
    let expr: string;
    if (rule.op === "is" || rule.op === "isnot") {
      if (isArray(ref)) {
        expr =
          values.length === 1
            ? `${ref}.includes(${literal(values[0])})`
            : `${literal(values)}.some((v) => ${ref}.includes(v))`;
      } else {
        expr = values.length === 1 ? `${ref} === ${literal(values[0])}` : `${literal(values)}.includes(${ref})`;
      }
      if (rule.op === "isnot") expr = values.length === 1 && !isArray(ref) ? expr.replace(" === ", " !== ") : `!${expr}`;
    } else {
      const symbol = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[rule.op];
      expr = `${ref} ${symbol} ${literal(rule.value)}`;
    }
    return condition.rules.length > 1 ? `(${expr})` : expr;
  });
  return parts.join(condition.match === "any" ? " || " : " && ");
}
