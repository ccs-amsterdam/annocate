import {
  evaluateSimpleCondition,
  parseSimpleCondition,
  type CodebookItem,
  type Condition,
  type ReferenceScope,
} from "@annotinder/contracts";
import { evaluateScript } from "./expression";
import type { ExpressionCache } from "./expressionCache";

/**
 * Evaluates a condition (docs/client.md "References and conditions") for a
 * `condition` item or a unit-loop branch `when`: a simple condition (helper
 * calls, `.answered`, `&&`, `||`, `!`) directly, shared with the contracts
 * package; any other script in the QuickJS sandbox (truthy = holds). A
 * failing script counts as false.
 */
export async function evaluateCondition(
  condition: Condition,
  scope: ReferenceScope,
  cache?: ExpressionCache,
  key = "condition",
): Promise<boolean> {
  const simple = parseSimpleCondition(condition.script);
  if (simple) return evaluateSimpleCondition(simple, scope);
  const result = cache ? await cache.evaluate(key, condition.script, scope) : await evaluateScript(condition.script, scope);
  return Boolean(result);
}

/** A one-line summary of a condition, e.g. for the codebook tree. */
export function describeCondition(condition: Condition | undefined): string {
  if (!condition) return "(none)";
  return condition.script.trim() || "(empty script)";
}

/**
 * How an item is called in the editor: its name, and for a condition (which
 * has none) its label, or else its condition.
 */
export function itemTitle(item: CodebookItem): string {
  if (item.type === "condition") return item.label?.trim() || `if ${describeCondition(item.condition)}`;
  return item.name;
}
