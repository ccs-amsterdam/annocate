import {
  callArgumentProblems,
  describeQuestion,
  printSimpleCondition,
  questionKind,
  referenceShape,
  METHOD_TEXT,
  type AnyVariableType,
  type CountComparison,
  type HelperMethod,
  type Option,
  type OptionValue,
  type QuestionKind,
  type SimpleCondition,
} from "@annotinder/contracts";

// The condition editor's rules mode (docs/client.md §5): a simple condition
// that is a flat list of rows joined by all `&&` or all `||`. Each row is
// one helper call or `.answered`, possibly negated. Reading a script into
// rows and writing rows back go through the contracts' simple-condition
// parser and printer, so the stored form is always the script.
//
// A row may not fit its question (any more): the question is gone, changed
// type, or lost an option. It stays a row, unchanged, with a problem to show
// (`rowProblems`), so researchers can fix it without editing the script.

/** What a row is about: a question, or one item of a scale. */
export interface RuleTarget {
  question: string;
  item?: string;
  /** The kind that decides the operators (scale items: ordinal). */
  kind: QuestionKind;
  /** The options, for picking values (none for numeric and confirm). */
  options?: Option[];
  label: string;
  /** The question's type. */
  variable: AnyVariableType;
}

/** An operator in the editor: a helper method, possibly negated, `count()` with a comparison, or `.answered`. */
export interface RuleOperator {
  key: string;
  label: string;
  method?: HelperMethod;
  negate?: boolean;
  answered?: boolean;
  count?: CountComparison;
  /** How the arguments are entered. */
  args: "one" | "several" | "number" | "range" | "none";
}

const ANSWERED: RuleOperator[] = [
  { key: "answered", label: "is answered", answered: true, args: "none" },
  { key: "unanswered", label: "is not answered", answered: true, negate: true, args: "none" },
];
const ORDER: RuleOperator[] = [
  { key: "gt", label: ">", method: "gt", args: "one" },
  { key: "gte", label: "≥", method: "gte", args: "one" },
  { key: "lt", label: "<", method: "lt", args: "one" },
  { key: "lte", label: "≤", method: "lte", args: "one" },
];
const SINGLE: RuleOperator[] = [
  { key: "is", label: "is", method: "is", args: "one" },
  { key: "isnot", label: "is not", method: "is", negate: true, args: "one" },
  { key: "isAny", label: "is one of", method: "isAny", args: "several" },
  { key: "isNone", label: "is none of", method: "isAny", negate: true, args: "several" },
];
const HAS: RuleOperator[] = [
  { key: "has", label: "has", method: "has", args: "one" },
  { key: "hasNot", label: "doesn't have", method: "has", negate: true, args: "one" },
];
const COUNT: RuleOperator[] = [
  { key: "countGte", label: "count ≥", method: "count", count: ">=", args: "number" },
  { key: "countLte", label: "count ≤", method: "count", count: "<=", args: "number" },
];

/** The operators for a kind of question (or scale item). */
export function ruleOperators(kind: QuestionKind): RuleOperator[] {
  switch (kind) {
    case "single":
      return [...SINGLE, ...ANSWERED];
    case "ordinal":
      return [...SINGLE, ...ORDER, ...ANSWERED];
    case "numeric":
      return [
        { key: "eq", label: "=", method: "eq", args: "number" },
        { key: "neq", label: "≠", method: "eq", negate: true, args: "number" },
        ...ORDER.map((o) => ({ ...o, args: "number" as const })),
        { key: "between", label: "between", method: "between", args: "range" },
        ...ANSWERED,
      ];
    case "multiple":
      return [
        ...HAS,
        { key: "hasAny", label: "has any of", method: "hasAny", args: "several" },
        { key: "hasNone", label: "has none of", method: "hasAny", negate: true, args: "several" },
        { key: "hasAll", label: "has all of", method: "hasAll", args: "several" },
        ...COUNT,
        ...ANSWERED,
      ];
    case "span":
    case "relation":
      return [...HAS, ...COUNT, ...ANSWERED];
    default:
      return ANSWERED;
  }
}

/** The targets rows can be about, from the questions available at this point. */
export function ruleTargets(questions: { name: string; variable: AnyVariableType }[]): RuleTarget[] {
  return questions.flatMap(({ name, variable }) => {
    const options = "options" in variable ? variable.options : undefined;
    const own: RuleTarget = { question: name, kind: questionKind(variable), options, label: name, variable };
    if (variable.type !== "scale") return [own];
    return [
      own,
      ...variable.items.map((item) => ({
        question: name,
        item: item.name,
        kind: "ordinal" as const,
        options,
        label: `${name} › ${item.label ?? item.name}`,
        variable,
      })),
    ];
  });
}

export interface RuleRow {
  question: string;
  item?: string;
  /** The operator's key; "" if none fits the question (see `raw`). */
  operator: string;
  args: OptionValue[];
  /** The row as read from the script: written back as is while no operator fits it. */
  raw?: SimpleCondition;
}

export interface RuleRows {
  match: "all" | "any";
  rows: RuleRow[];
}

/** A row as a simple condition, given its target. */
function rowCondition(row: RuleRow, target: RuleTarget | undefined): SimpleCondition | null {
  const operator = target && ruleOperators(target.kind).find((o) => o.key === row.operator);
  if (!operator) return row.raw ?? null;
  let condition: SimpleCondition;
  if (operator.answered) condition = { op: "answered", question: row.question };
  else {
    condition = {
      op: "call",
      question: row.question,
      ...(row.item ? { item: row.item } : {}),
      method: operator.method!,
      args: operator.count ? [] : row.args,
      ...(operator.count ? { compare: { op: operator.count, value: Number(row.args[0] ?? 0) } } : {}),
    };
  }
  return operator.negate ? { op: "not", arg: condition } : condition;
}

/** The script for rows (an empty list: `true`). */
export function rowsToScript(rules: RuleRows, targets: RuleTarget[]): string {
  const conditions = rules.rows.flatMap((row) => {
    const c = rowCondition(row, findTarget(targets, row));
    return c ? [c] : [];
  });
  if (conditions.length === 0) return "true";
  return printSimpleCondition(conditions.length === 1 ? conditions[0] : { op: rules.match === "any" ? "or" : "and", args: conditions });
}

export function findTarget(targets: RuleTarget[], row: { question: string; item?: string }): RuleTarget | undefined {
  return targets.find((t) => t.question === row.question && t.item === row.item);
}

/**
 * One simple condition as a row: a helper call or `.answered`, possibly
 * negated (else null). If no operator of its question fits, the row keeps
 * the condition as `raw`.
 */
function conditionRow(condition: SimpleCondition, targets: RuleTarget[]): RuleRow | null {
  const negate = condition.op === "not";
  const inner = condition.op === "not" ? condition.arg : condition;
  if (inner.op === "answered") {
    return { question: inner.question, operator: negate ? "unanswered" : "answered", args: [], raw: condition };
  }
  if (inner.op !== "call") return null;
  const target = findTarget(targets, inner);
  const operator = target
    ? ruleOperators(target.kind).find((o) => o.method === inner.method && Boolean(o.negate) === negate && o.count === inner.compare?.op)
    : undefined;
  const args = inner.compare ? [inner.compare.value] : inner.args;
  return { question: inner.question, ...(inner.item ? { item: inner.item } : {}), operator: operator?.key ?? "", args, raw: condition };
}

/** What a row without a fitting operator says, in words: "lower than", "not is one of". */
export function rawOperatorLabel(row: RuleRow): string {
  const negate = row.raw?.op === "not";
  const inner = row.raw?.op === "not" ? row.raw.arg : row.raw;
  if (!inner || inner.op !== "call") return "?";
  const text = inner.compare ? `count ${inner.compare.op}` : METHOD_TEXT[inner.method];
  return negate ? `not ${text}` : text;
}

/**
 * Why a row doesn't fit the questions available here, in words (empty if
 * it does): the question isn't one, the operator doesn't fit its type, or
 * a value isn't one of its options.
 */
export function rowProblems(row: RuleRow, targets: RuleTarget[]): string[] {
  const target = findTarget(targets, row);
  const subject = row.item ? `"${row.question} › ${row.item}"` : `"${row.question}"`;
  if (!target) {
    const question = targets.find((t) => t.question === row.question);
    if (question && row.item) return [`${subject}: "${row.item}" is not an item of "${row.question}", ${describeQuestion(question.variable)}`];
    return [`${subject} is not a question asked before this point`];
  }
  const operator = ruleOperators(target.kind).find((o) => o.key === row.operator);
  const inner = row.raw?.op === "not" ? row.raw.arg : row.raw;
  if (!operator) {
    if (inner?.op !== "call") return [`${subject} doesn't support this rule`];
    const path = inner.item ? [inner.question, "items", inner.item, inner.method] : [inner.question, inner.method];
    const shape = referenceShape(new Map([[row.question, target.variable]]), { ns: "var", path, call: true });
    if (!shape.ok) return [shape.reason];
    // The method fits, but not with this comparison (e.g. `count() > 2`).
    return [`${subject}: "${rawOperatorLabel(row)}" can't be edited as a rule; choose another, or edit the script`];
  }
  if (operator.answered || operator.count) return [];
  return callArgumentProblems(target.variable, { question: row.question, item: row.item, method: operator.method!, args: row.args });
}

/** A simple condition as rows, if it is a flat list of rows (else null: edit it as a script). */
export function conditionToRows(condition: SimpleCondition, targets: RuleTarget[]): RuleRows | null {
  if (condition.op === "const") return condition.value ? { match: "all", rows: [] } : null;
  const parts = condition.op === "and" || condition.op === "or" ? condition.args : [condition];
  const rows = parts.map((p) => conditionRow(p, targets));
  if (rows.some((r) => r === null)) return null;
  return { match: condition.op === "or" ? "any" : "all", rows: rows as RuleRow[] };
}

/** A new row for a target: its first operator and value. */
export function defaultRow(target: RuleTarget): RuleRow {
  const operator = ruleOperators(target.kind)[0];
  const first = target.options?.[0]?.value;
  const args = operator.args === "none" ? [] : operator.args === "range" ? [0, 1] : operator.args === "number" ? [0] : first !== undefined ? [first] : [];
  return { question: target.question, ...(target.item ? { item: target.item } : {}), operator: operator.key, args };
}
