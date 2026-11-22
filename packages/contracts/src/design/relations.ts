import type { RelationEnd, RelationRule } from "./variableTypes.js";

// Which relations coders can make (a relation question's `rules`): which
// spans can start one, which spans it can then go to, and with which
// relation types. Spans are named by their question (`variable`) and value.

/** A span as the rules see it: the span question it answers, its value (label) and its id. */
export interface RuleSpan {
  id: string;
  variable: string;
  value: string;
}

const matches = (end: RelationEnd, span: RuleSpan) =>
  end.variable === span.variable && (!end.values || end.values.length === 0 || end.values.includes(span.value));

/** Whether a relation can start at this span (some rule's `from` takes it). */
export function canStartRelation(rules: readonly RelationRule[], span: RuleSpan): boolean {
  return rules.some((rule) => matches(rule.from, span));
}

/**
 * The relation types (option values, in `options` order) a relation from
 * `from` to `to` can have; none for a span to itself.
 */
export function relationTypesFor(
  rules: readonly RelationRule[],
  options: readonly { value: string }[],
  from: RuleSpan,
  to: RuleSpan,
): string[] {
  if (from.id === to.id) return [];
  const allowed = new Set<string>();
  for (const rule of rules) {
    if (!matches(rule.from, from) || !matches(rule.to, to)) continue;
    for (const o of options) if (!rule.options || rule.options.includes(o.value)) allowed.add(o.value);
  }
  return options.filter((o) => allowed.has(o.value)).map((o) => o.value);
}

/** The span questions a relation question's rules name (whose spans the coding screen shows). */
export function ruleVariables(rules: readonly RelationRule[]): string[] {
  return [...new Set(rules.flatMap((r) => [r.from.variable, r.to.variable]))];
}
