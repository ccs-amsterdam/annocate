import {
  collectQuestions,
  loopTitle,
  optionLabel,
  unitLoops,
  type AnnotationRow,
  type AnyVariableType,
  type CoderProgress,
  type OptionValue,
  type TopLevelItem,
  type UnitVersion,
  type VariableValue,
} from "@annotinder/contracts";

// The researcher UI's data download (docs/client.md §7, "Results"): one zip
// with the researcher API's data as wide tables, the way people analyse
// them in R, SPSS or a spreadsheet:
//
// - annotations: a row per unit and coder, a column per question;
// - coders: a row per coder, with their coder-level answers;
// - units: the unit versions answers were given on (what coders saw);
// - variables: per codebook version, question and option its label.
//
// Answers are the stored option values; with labels, each answer column is
// followed by a `_label` column, the label in the codebook version the
// answer was given under (what the coder saw). A scale has a column per item
// (`question.item`), several answers are joined with "; ", spans are
// "value: text", and a question a condition skipped is empty.

export interface Table {
  headers: string[];
  rows: string[][];
}

/** How a value is written: as is, or as its label. */
type Write = (value: OptionValue) => string;
const asIs: Write = (v) => String(v);

/** The text of one answer cell (a scale item's answers go in their own columns: `item`). */
export function answerText(value: VariableValue | undefined, item?: string, write: Write = asIs): string {
  if (!value || value.skip) return "";
  const parts: string[] = [];
  for (const v of value.values ?? []) if (v.item === item) parts.push(write(v.value));
  for (const s of value.spans ?? []) parts.push(`${write(s.value)}: ${s.slices.map((x) => x.text).join(" … ")}`);
  for (const r of value.relations ?? []) parts.push(`${write(r.value)} (${r.fromId} → ${r.toId})`);
  return parts.join("; ");
}

/**
 * Option labels per codebook version: the label of a value in the version
 * an answer was given under, else in the live version, else in any (an
 * option an update removed), else the value itself.
 */
export class Labels {
  /** codebook id -> question -> value -> label. */
  private byCodebook = new Map<number, Map<string, Map<string, string>>>();

  constructor(
    codebooks: ReadonlyMap<number, TopLevelItem[]>,
    private liveId: number | null = null,
  ) {
    for (const [id, items] of codebooks) {
      const questions = new Map<string, Map<string, string>>();
      for (const [name, variable] of collectQuestions(items).questions) {
        const options = optionsOf(variable);
        if (options) questions.set(name, new Map(options.map((o) => [String(o.value), optionLabel(o)])));
      }
      this.byCodebook.set(id, questions);
    }
  }

  /** Whether the question has labels (options) in any version. */
  has(question: string): boolean {
    return [...this.byCodebook.values()].some((q) => q.has(question));
  }

  /** How to write a question's values as labels, for an answer given under `codebookId`. */
  writer(question: string, codebookId: number | null): Write {
    const order = [codebookId, this.liveId, ...this.byCodebook.keys()];
    return (value) => {
      for (const id of order) {
        const label = id === null ? undefined : this.byCodebook.get(id)?.get(question)?.get(String(value));
        if (label !== undefined) return label;
      }
      return String(value);
    };
  }
}

/** A question's options (with labels), if it has any. */
function optionsOf(variable: AnyVariableType): { value: OptionValue; label?: string }[] | undefined {
  return "options" in variable && Array.isArray(variable.options) ? variable.options : undefined;
}

interface Column {
  variable: string;
  item?: string;
  label?: boolean;
}

/** The answer columns for some values: per question a column (a scale one per item), in codebook order, with label columns. */
function answerColumns(values: Iterable<[string, VariableValue]>, order: string[], labels?: Labels): Column[] {
  const items = new Map<string, Set<string | undefined>>();
  for (const [variable, value] of values) {
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
    return labels?.has(variable) ? columns.flatMap((c) => [c, { ...c, label: true }]) : columns;
  });
}

const header = (c: Column) => `${c.item ? `${c.variable}.${c.item}` : c.variable}${c.label ? "_label" : ""}`;
const time = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : "");
const cellOf = (value: VariableValue | undefined, c: Column, labels: Labels | undefined, codebookId: number | null) =>
  answerText(value, c.item, c.label && labels ? labels.writer(c.variable, codebookId) : asIs);

/** Question names in codebook order (the live codebook's, if given). */
export function questionOrder(items: TopLevelItem[] | undefined): string[] {
  return items ? [...collectQuestions(items).questions.keys()] : [];
}

/**
 * Annotations as a table: a row per unit and coder (in the order the coder
 * first answered the unit), with the unit version they saw, when they first
 * and last answered it, the codebook version, and a column per question.
 */
export function annotationsTable(annotations: AnnotationRow[], coders: CoderProgress[], order: string[] = [], labels?: Labels): Table {
  const coderById = new Map(coders.map((c) => [c.id, c]));
  // Per answer also the codebook version it was given under: its labels are the ones its coder saw.
  const byUnitCoder = new Map<string, { first: AnnotationRow; last: Date; values: Map<string, VariableValue>; codebooks: Map<string, number | null> }>();
  for (const a of annotations) {
    const key = `${a.unitId}/${a.coderId}`;
    let row = byUnitCoder.get(key);
    if (!row) byUnitCoder.set(key, (row = { first: a, last: new Date(a.updated), values: new Map(), codebooks: new Map() }));
    row.values.set(a.variable, a.value);
    row.codebooks.set(a.variable, a.codebookId);
    if (new Date(a.updated) > row.last) row.last = new Date(a.updated);
  }
  const columns = answerColumns(
    [...byUnitCoder.values()].flatMap((r) => [...r.values]),
    order,
    labels,
  );
  return {
    headers: [
      "unit_id",
      "unit_version_id",
      "coder_id",
      "participant_id",
      "invitation",
      "first_answer",
      "last_change",
      "codebook_id",
      ...columns.map(header),
    ],
    rows: [...byUnitCoder.values()].map(({ first, last, values, codebooks }) => [
      first.externalId,
      first.unitVersionId === null ? "" : String(first.unitVersionId),
      String(first.coderId),
      first.participantId ?? "",
      coderById.get(first.coderId)?.inviteLabel ?? "",
      time(first.created),
      time(last),
      first.codebookId === null ? "" : String(first.codebookId),
      ...columns.map((c) => cellOf(values.get(c.variable), c, labels, codebooks.get(c.variable) ?? first.codebookId)),
    ]),
  };
}

/**
 * Coders as a table: who they are (invitation, participant id), when they
 * started and were last active, how their session ended, units finished
 * per loop, and their coder-level answers (survey questions, `auto` groups;
 * labels from the live codebook).
 */
export function codersTable(coders: CoderProgress[], order: string[] = [], labels?: Labels): Table {
  const loops = [...new Set(coders.flatMap((c) => Object.keys(c.finished)))].sort();
  const columns = answerColumns(
    coders.flatMap((c) => Object.entries(c.variables)),
    order,
    labels,
  );
  return {
    headers: [
      "coder_id",
      "participant_id",
      "invitation",
      "started",
      "last_active",
      "ended",
      "ended_at",
      ...loops.map((l) => `finished_${l}`),
      ...columns.map(header),
    ],
    rows: coders.map((c) => [
      String(c.id),
      c.participantId ?? "",
      c.inviteLabel ?? "",
      time(c.started),
      time(c.lastActive),
      c.ended?.outcome ?? "",
      time(c.ended?.at),
      ...loops.map((l) => String(c.finished[l] ?? 0)),
      ...columns.map((col) => cellOf(c.variables[col.variable], col, labels, null)),
    ]),
  };
}

/**
 * The unit versions answers were given on: a row per version (a unit
 * replaced after it was coded has several), with the fields as shown.
 * Join the annotations on `unit_version_id`.
 */
export function unitsTable(versions: UnitVersion[], annotations: AnnotationRow[]): Table {
  const used = new Set(annotations.map((a) => a.unitVersionId));
  const coded = versions.filter((v) => used.has(v.id));
  const fields = [...new Set(coded.flatMap((v) => Object.keys(v.data)))];
  return {
    headers: ["unit_version_id", "unit_id", "hash", "first_shown", ...fields],
    rows: coded.map((v) => [
      String(v.id),
      v.externalId,
      v.hash,
      time(v.created),
      ...fields.map((f) => (v.data[f] === null || v.data[f] === undefined ? "" : String(v.data[f]))),
    ]),
  };
}

/**
 * The questions of each codebook version and their options: a row per
 * version, question (a scale: per item, `question.item`) and option, with
 * its label; questions without options have one row. The loop is the one
 * the question is in (empty: asked once per coder).
 */
export function variablesTable(codebooks: ReadonlyMap<number, TopLevelItem[]>): Table {
  const rows: string[][] = [];
  for (const [id, items] of [...codebooks].sort(([a], [b]) => a - b)) {
    const { questions, loopOf } = collectQuestions(items);
    const titles = new Map(unitLoops(items).map(({ key, loop }) => [key, loopTitle(loop, key)]));
    for (const [name, variable] of questions) {
      const loop = titles.get(loopOf.get(name) ?? "") ?? "";
      const text = "question" in variable && typeof variable.question === "string" ? variable.question : "";
      const names = variable.type === "scale" ? variable.items.map((i) => `${name}.${i.name}`) : [name];
      const options = optionsOf(variable) ?? [];
      for (const n of names) {
        if (options.length === 0) rows.push([String(id), loop, n, variable.type, text, "", ""]);
        for (const o of options) rows.push([String(id), loop, n, variable.type, text, String(o.value), optionLabel(o)]);
      }
    }
  }
  return { headers: ["codebook_id", "loop", "variable", "type", "question", "value", "label"], rows };
}

/** What the files in the download are, for the README. */
export function readme(job: string, exported: Date, labels: boolean): string {
  return `Data of ${job}, downloaded ${exported.toISOString()} from AnnoTinder.

annotations.csv  A row per unit and coder: the unit's id (unit_id), the unit
                 version the coder saw (unit_version_id), the coder, when they
                 first and last answered, the codebook version (codebook_id),
                 and a column per question (a scale: a column per item,
                 question.item).${labels ? `
                 Each answer column is followed by a _label column: the label
                 in the codebook version the answer was given under.` : ""}
coders.csv       A row per coder: invitation, participant id, started, last
                 active, how their session ended, units finished per loop,
                 and their answers outside unit loops.
units.csv        The units as coders saw them (only the fields the codebook
                 used), a row per version: a unit replaced after it was coded
                 has a row per version. Join annotations on unit_version_id.
variables.csv    Per codebook version, question and option: the question text,
                 the stored value and its label.

Answers are the stored values; several answers are joined with "; ", spans
are written as "value: text", and questions a condition skipped are empty.
Join annotations and coders on coder_id. Times are UTC (ISO 8601).
`;
}

/** A table as CSV (RFC 4180 quoting), with a byte order mark so spreadsheet programs read it as UTF-8. */
export function toCsv(table: Table): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [table.headers, ...table.rows].map((row) => row.map(cell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
