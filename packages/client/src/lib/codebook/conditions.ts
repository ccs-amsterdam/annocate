import {
  evaluateSimpleCondition,
  parseSimpleCondition,
  type DesignItem,
  type Condition,
  type ReferenceScope,
  type SimpleCondition,
} from "@annotinder/contracts";
import { evaluateScript } from "./expression";
import type { ExpressionCache } from "./expressionCache";

/**
 * Evaluates a condition (docs/client.md §5 "References and conditions"), e.g.
 * a branch's: a simple condition (helper calls, `.answered`, `&&`,
 * `||`, `!`) directly, shared with the contracts package; any other script
 * in the QuickJS sandbox (truthy = holds). A failing script counts as false.
 */
export async function evaluateCondition(
  condition: Condition | undefined,
  scope: ReferenceScope,
  cache?: ExpressionCache,
  key = "condition",
): Promise<boolean> {
  // A loop without a condition is always shown
  if (!condition) return true;
  const simple = parseSimpleCondition(condition.script);
  if (simple) return evaluateSimpleCondition(simple, scope);
  const result = cache
    ? await cache.evaluate(key, condition.script, scope)
    : await evaluateScript(condition.script, scope);
  return Boolean(result);
}

/** A one-line summary of a condition, e.g. for the codebook tree: in words if it is simple, else the script. */
export function describeCondition(condition: Condition | undefined): string {
  if (!condition) return "(none)";
  const simple = parseSimpleCondition(condition.script);
  return (simple && readableCondition(simple)) || condition.script.trim() || "(empty script)";
}

const OPERATORS: Record<string, string> = {
  is: "is",
  isAny: "is one of",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  eq: "=",
  between: "between",
  has: "has",
  hasAny: "has any of",
  hasAll: "has all of",
};
/** Negated helpers that read as one operator. */
const NEGATED: Record<string, string> = {
  is: "is not",
  isAny: "is none of",
  eq: "≠",
  has: "doesn't have",
  hasAny: "has none of",
};
const COMPARE: Record<string, string> = { ">=": "≥", "<=": "≤", "===": "=", "!==": "≠" };

/**
 * A simple condition in words, as researchers would write it:
 * `$var.group.is("experiment")` reads `group is "experiment"`,
 * `$var.age.between(18, 65) && !$var.consent.answered` reads
 * `age between 18 and 65 and consent is not answered`.
 */
function readableCondition(condition: SimpleCondition, nested = false): string {
  const value = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : String(v));
  switch (condition.op) {
    case "const":
      return condition.value ? "always" : "never";
    case "and":
    case "or": {
      const text = condition.args.map((a) => readableCondition(a, true)).join(` ${condition.op} `);
      return nested ? `(${text})` : text;
    }
    case "answered":
      return `${condition.question} is answered`;
    case "not": {
      const inner = condition.arg;
      if (inner.op === "answered") return `${inner.question} is not answered`;
      if (inner.op === "call" && !inner.compare && NEGATED[inner.method]) return call(inner, NEGATED[inner.method]);
      return `not ${readableCondition(inner, true)}`;
    }
    case "call":
      return call(condition, OPERATORS[condition.method] ?? condition.method);
  }

  function call(c: Extract<SimpleCondition, { op: "call" }>, operator: string): string {
    const subject = c.item ? `${c.question} › ${c.item}` : c.question;
    if (c.compare) return `${subject} count ${COMPARE[c.compare.op] ?? c.compare.op} ${c.compare.value}`;
    if (c.method === "between") return `${subject} between ${value(c.args[0])} and ${value(c.args[1])}`;
    return `${subject} ${operator} ${c.args.map(value).join(", ")}`;
  }
}

/**
 * How an item is called in the editor: its name; for a branch (which has
 * none) its label, or else its condition, or "Branch"; for a unit loop its
 * label, or "Unit loop"; for a layout "Layout" with its label after it, or "Unit layout".
 */
export function itemTitle(item: DesignItem): string {
  // The editor's stand-in for a branch's else items (codebook/tree.ts `ELSE`)
  if ((item as { type: string }).type === "else") return "Else";
  if (item.type === "branch")
    return item.label?.trim() || (item.condition?.script.trim() ? `if ${describeCondition(item.condition)}` : "Branch");
  if (item.type === "unit_loop") return item.label?.trim() || "Unit loop";
  if (item.type === "session") return "Study entry";
  // "Layout" always, so a labelled one still reads as a layout
  if (item.type === "layout") return item.label?.trim() ? `Layout – ${item.label.trim()}` : "Unit layout";
  return item.name;
}
