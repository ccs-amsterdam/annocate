import {
  collectQuestions,
  type AnnotationRow,
  type CoderProgress,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";

// The researcher UI's data download (docs/client.md §7, "Results"): the
// researcher API's annotation rows (one per unit, coder and question) and
// coders as two wide tables, the way people analyse them in R, SPSS or a
// spreadsheet:
//
// - annotations: a row per unit and coder, a column per question;
// - coders: a row per coder, with their coder-level answers.
//
// Answers are the stored option values, not labels. A scale has a column per
// item (`question.item`), several answers are joined with "; ", spans are
// "label: text", and a question a condition skipped is empty.

export interface Table {
  headers: string[];
  rows: string[][];
}

/** The text of one answer cell (a scale item's answers go in their own columns: `item`). */
export function answerText(value: VariableValue | undefined, item?: string): string {
  if (!value || value.skip) return "";
  const parts: string[] = [];
  for (const v of value.values ?? []) if (v.item === item) parts.push(String(v.value));
  for (const s of value.spans ?? []) parts.push(`${s.value}: ${s.slices.map((x) => x.text).join(" … ")}`);
  for (const r of value.relations ?? []) parts.push(`${r.value} (${r.fromId} → ${r.toId})`);
  return parts.join("; ");
}

/** The answer columns for some values: per question, a column (or for a scale one per item), in codebook order. */
function answerColumns(values: Iterable<[string, VariableValue]>, order: string[]): { variable: string; item?: string }[] {
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
    return named.length > 0 ? named.map((item) => ({ variable, item })) : [{ variable }];
  });
}

const header = (c: { variable: string; item?: string }) => (c.item ? `${c.variable}.${c.item}` : c.variable);
const time = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : "");

/** Question names in codebook order (the live codebook's, if given). */
export function questionOrder(items: TopLevelItem[] | undefined): string[] {
  return items ? [...collectQuestions(items).questions.keys()] : [];
}

/**
 * Annotations as a table: a row per unit and coder (in the order the coder
 * first answered the unit), with when they first and last answered it, the
 * codebook version, and a column per question.
 */
export function annotationsTable(annotations: AnnotationRow[], coders: CoderProgress[], order: string[] = []): Table {
  const coderById = new Map(coders.map((c) => [c.id, c]));
  const byUnitCoder = new Map<string, { first: AnnotationRow; last: Date; values: Map<string, VariableValue> }>();
  for (const a of annotations) {
    const key = `${a.unitId}/${a.coderId}`;
    let row = byUnitCoder.get(key);
    if (!row) byUnitCoder.set(key, (row = { first: a, last: new Date(a.updated), values: new Map() }));
    row.values.set(a.variable, a.value);
    if (new Date(a.updated) > row.last) row.last = new Date(a.updated);
  }
  const columns = answerColumns(
    [...byUnitCoder.values()].flatMap((r) => [...r.values]),
    order,
  );
  return {
    headers: ["unit_id", "coder_id", "participant_id", "invitation", "first_answer", "last_change", "codebook_id", ...columns.map(header)],
    rows: [...byUnitCoder.values()].map(({ first, last, values }) => [
      first.externalId,
      String(first.coderId),
      first.participantId ?? "",
      coderById.get(first.coderId)?.inviteLabel ?? "",
      time(first.created),
      time(last),
      first.codebookId === null ? "" : String(first.codebookId),
      ...columns.map((c) => answerText(values.get(c.variable), c.item)),
    ]),
  };
}

/**
 * Coders as a table: who they are (invitation, participant id), when they
 * started and were last active, how their session ended, units finished
 * per loop, and their coder-level answers (survey questions, `auto` groups).
 */
export function codersTable(coders: CoderProgress[], order: string[] = []): Table {
  const loops = [...new Set(coders.flatMap((c) => Object.keys(c.finished)))].sort();
  const columns = answerColumns(
    coders.flatMap((c) => Object.entries(c.variables)),
    order,
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
      ...columns.map((col) => answerText(c.variables[col.variable], col.item)),
    ]),
  };
}

/** A table as CSV (RFC 4180 quoting), with a byte order mark so spreadsheet programs read it as UTF-8. */
export function toCsv(table: Table): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [table.headers, ...table.rows].map((row) => row.map(cell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
