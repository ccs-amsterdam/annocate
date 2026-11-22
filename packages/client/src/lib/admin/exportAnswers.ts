import {
  collectQuestions,
  hasNumericCodes,
  optionLabel,
  type AnyVariableType,
  type SpanAnswer,
  type OptionValue,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";

// Answers as cells of the data download's tables (exportData.ts): the
// stored option values, or with labels the label in the design version the
// answer was given under (what the coder saw). A scale has a column per item
// (`question.item`), several answers are joined with "; ", spans are
// "value: text", a confirm question is `true`, and a question a condition
// skipped is empty. Answers that don't fit one cell (spans, relations,
// several answers) also get a `_json` column with everything (span
// positions and fields, ids). In those, the codes of a question whose
// option values are all plain numbers ("1", "2", "99"; not "01") are
// numbers.

/** How a value is written: as is, or as its label. */
export type Write = (value: OptionValue) => string;
export const asIs: Write = (v) => String(v);

/** A span's text (its fragments joined with " … "). */
const spanText = (span: SpanAnswer) => span.slices.map((x) => x.text).join(" … ");

/**
 * The text of one answer cell (a scale item's answers go in their own
 * columns: `item`). A relation names its spans by their text, found among
 * `spans` (the spans of the same unit and coder).
 */
export function answerText(
  value: VariableValue | undefined,
  item?: string,
  write: Write = asIs,
  spans?: ReadonlyMap<string, SpanAnswer>,
): string {
  if (!value || value.skip) return "";
  // A confirm question: answered, without a value.
  if (!value.values && !value.spans && !value.relations) return "true";
  const parts: string[] = [];
  for (const v of value.values ?? []) if (v.item === item) parts.push(write(v.value));
  for (const s of value.spans ?? []) parts.push(`${write(s.value)}: ${spanText(s)}`);
  const end = (id: string) => {
    const span = spans?.get(id);
    return span ? spanText(span) : id;
  };
  for (const r of value.relations ?? []) parts.push(`${write(r.value)}: ${end(r.fromId)} → ${end(r.toId)}`);
  return parts.join("; ");
}

/**
 * An answer in full, as JSON (for the `_json` columns): values, spans with
 * their fields and positions, relations with their span ids. With `numeric`
 * (a question with numeric codes), its codes are written as numbers.
 */
export function answerJson(value: VariableValue | undefined, numeric = false): string {
  if (!value || value.skip) return "";
  const code = (v: OptionValue) => (numeric && typeof v === "string" ? Number(v) : v);
  if (value.spans)
    return JSON.stringify(
      value.spans.map(({ id, value, field, slices }) => ({ id, value: code(value), field, slices })),
    );
  if (value.relations)
    return JSON.stringify(
      value.relations.map(({ id, value, fromId, toId }) => ({ id, value: code(value), fromId, toId })),
    );
  return JSON.stringify((value.values ?? []).map((v) => code(v.value)));
}

/** Questions whose option values are all plain numbers (numeric codes): numbers in the `_json` columns. */
export function numericCodeQuestions(items: TopLevelItem[] | undefined): Set<string> {
  if (!items) return new Set();
  const numeric = [...collectQuestions(items).questions].filter(([, v]) => hasNumericCodes(optionsOf(v)));
  return new Set(numeric.map(([name]) => name));
}

/** Questions whose answers don't fit one cell (spans, relations, several answers): they get a `_json` column. */
export function nestedQuestions(items: TopLevelItem[] | undefined): Set<string> {
  if (!items) return new Set();
  const nested = [...collectQuestions(items).questions].filter(
    ([, v]) => v.type === "span" || v.type === "relation" || (v.type === "nominal" && v.multiple),
  );
  return new Set(nested.map(([name]) => name));
}

/**
 * Option labels per design version: the label of a value in the version
 * an answer was given under, else in the live version, else in any (an
 * option an update removed), else the value itself.
 */
export class Labels {
  /** design version id -> question -> value -> label. */
  private byVersion = new Map<number, Map<string, Map<string, string>>>();

  constructor(
    designVersions: ReadonlyMap<number, TopLevelItem[]>,
    private liveId: number | null = null,
  ) {
    for (const [id, items] of designVersions) {
      const questions = new Map<string, Map<string, string>>();
      for (const [name, variable] of collectQuestions(items).questions) {
        const options = optionsOf(variable);
        if (options) questions.set(name, new Map(options.map((o) => [String(o.value), optionLabel(o)])));
      }
      this.byVersion.set(id, questions);
    }
  }

  /** Whether the question has labels (options) in any version. */
  has(question: string): boolean {
    return [...this.byVersion.values()].some((q) => q.has(question));
  }

  /** How to write a question's values as labels, for an answer given under `designVersionId`. */
  writer(question: string, designVersionId: number | null): Write {
    const order = [designVersionId, this.liveId, ...this.byVersion.keys()];
    return (value) => {
      for (const id of order) {
        const label = id === null ? undefined : this.byVersion.get(id)?.get(question)?.get(String(value));
        if (label !== undefined) return label;
      }
      return String(value);
    };
  }
}

/** A question's options (with labels), if it has any. */
export function optionsOf(variable: AnyVariableType): { value: OptionValue; label?: string }[] | undefined {
  return "options" in variable && Array.isArray(variable.options) ? variable.options : undefined;
}

/** An answer column: a question (a scale: one of its items), its labels, or its full answer as JSON. */
export interface Column {
  variable: string;
  item?: string;
  label?: boolean;
  json?: boolean;
}

/** The answer columns for some values: per question a column (a scale one per item), in design order, with label columns. */
export function answerColumns(
  values: Iterable<[string, VariableValue]>,
  order: string[],
  labels?: Labels,
  nested: ReadonlySet<string> = new Set(),
): Column[] {
  const items = new Map<string, Set<string | undefined>>();
  const json = new Set(nested);
  for (const [variable, value] of values) {
    // Nested answers found in the data, also of questions the live design version no longer has
    if (value.spans || value.relations || (value.values ?? []).filter((v) => v.item === undefined).length > 1)
      json.add(variable);
    const set = items.get(variable) ?? new Set();
    items.set(variable, set);
    const answerItems = (value.values ?? []).map((v) => v.item);
    if (answerItems.length === 0) set.add(undefined);
    for (const item of answerItems) set.add(item);
  }
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
  const names = [...items.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return names.flatMap((variable) => {
    const set = items.get(variable)!;
    const named = [...set].filter((i): i is string => i !== undefined).sort();
    // A question without items (or never answered with one) has one column.
    const columns: Column[] = named.length > 0 ? named.map((item) => ({ variable, item })) : [{ variable }];
    const withLabels = labels?.has(variable) ? columns.flatMap((c) => [c, { ...c, label: true }]) : columns;
    return json.has(variable) && named.length === 0 ? [...withLabels, { variable, json: true }] : withLabels;
  });
}

/** A column's header: `question`, `question.item`, plus `_label` or `_json`. */
export const header = (c: Column) =>
  `${c.item ? `${c.variable}.${c.item}` : c.variable}${c.label ? "_label" : c.json ? "_json" : ""}`;
/** The cell of an answer in a column. */
export const cellOf = (
  value: VariableValue | undefined,
  c: Column,
  labels: Labels | undefined,
  designVersionId: number | null,
  numeric: ReadonlySet<string>,
  spans?: ReadonlyMap<string, SpanAnswer>,
) =>
  c.json
    ? answerJson(value, numeric.has(c.variable))
    : answerText(value, c.item, c.label && labels ? labels.writer(c.variable, designVersionId) : asIs, spans);

/** Question names in design order (the live design version's, if given). */
export function questionOrder(items: TopLevelItem[] | undefined): string[] {
  return items ? [...collectQuestions(items).questions.keys()] : [];
}
