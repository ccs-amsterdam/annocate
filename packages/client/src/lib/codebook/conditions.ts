import { evaluateRules, type Condition, type ReferenceScope } from "@annotinder/contracts";
import { evaluateScript } from "./expression";
import type { ExpressionCache } from "./expressionCache";

/**
 * Evaluates a condition (docs/client.md "References and conditions") for a
 * `condition` item or a unit-loop branch `when`: rules directly (shared with
 * the contracts package), scripts in the QuickJS sandbox (truthy = holds).
 * A failing script counts as false.
 */
export async function evaluateCondition(
  condition: Condition,
  scope: ReferenceScope,
  cache?: ExpressionCache,
  key = "condition",
): Promise<boolean> {
  if (!("script" in condition)) return evaluateRules(condition, scope);
  const result = cache ? await cache.evaluate(key, condition.script, scope) : await evaluateScript(condition.script, scope);
  return Boolean(result);
}

const OP_LABELS: Record<string, string> = { is: "is", isnot: "is not", gt: ">", gte: "≥", lt: "<", lte: "≤" };

/** A one-line summary of a condition, e.g. for the codebook tree. */
export function describeCondition(condition: Condition | undefined): string {
  if (!condition) return "(none)";
  if ("script" in condition) return condition.script.trim() || "(empty script)";
  if (condition.rules.length === 0) return "always";
  return condition.rules
    .map((rule) => {
      const value = Array.isArray(rule.value) ? rule.value.join(" / ") : String(rule.value);
      return `${rule.ref} ${OP_LABELS[rule.op] ?? rule.op} ${value}`;
    })
    .join(condition.match === "any" ? " or " : " and ");
}
