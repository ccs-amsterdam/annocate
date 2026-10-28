import {
  collectQuestions,
  loopTitle,
  optionLabel,
  unitLoops,
  type AnnotationRow,
  type AnyVariableType,
  type SpanAnswer,
  type CoderDeletion,
  type Device,
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
// "value: text", a confirm question is `true`, and a question a condition
// skipped is empty. Answers that don't fit one cell (spans, relations,
// several answers) also get a `_json` column with everything (span
// positions and fields, ids).

export interface Table {
  headers: string[];
  rows: string[][];
}

/** How a value is written: as is, or as its label. */
type Write = (value: OptionValue) => string;
const asIs: Write = (v) => String(v);

/** A span's text (its fragments joined with " … "). */
const spanText = (span: SpanAnswer) => span.slices.map((x) => x.text).join(" … ");

/**
 * The text of one answer cell (a scale item's answers go in their own
 * columns: `item`). A relation names its spans by their text, found among
 * `spans` (the spans of the same unit and coder).
 */
export function answerText(value: VariableValue | undefined, item?: string, write: Write = asIs, spans?: ReadonlyMap<string, SpanAnswer>): string {
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

/** An answer in full, as JSON (for the `_json` columns): values, spans with their fields and positions, relations with their span ids. */
export function answerJson(value: VariableValue | undefined): string {
  if (!value || value.skip) return "";
  if (value.spans) return JSON.stringify(value.spans.map(({ id, value, field, slices }) => ({ id, value, field, slices })));
  if (value.relations) return JSON.stringify(value.relations.map(({ id, value, fromId, toId }) => ({ id, value, fromId, toId })));
  return JSON.stringify((value.values ?? []).map((v) => v.value));
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
  json?: boolean;
}

/** The answer columns for some values: per question a column (a scale one per item), in codebook order, with label columns. */
function answerColumns(values: Iterable<[string, VariableValue]>, order: string[], labels?: Labels, nested: ReadonlySet<string> = new Set()): Column[] {
  const items = new Map<string, Set<string | undefined>>();
  const json = new Set(nested);
  for (const [variable, value] of values) {
    // Nested answers found in the data, also of questions the live codebook no longer has
    if (value.spans || value.relations || (value.values ?? []).filter((v) => v.item === undefined).length > 1) json.add(variable);
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

const header = (c: Column) => `${c.item ? `${c.variable}.${c.item}` : c.variable}${c.label ? "_label" : c.json ? "_json" : ""}`;
const time = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : "");
const cellOf = (value: VariableValue | undefined, c: Column, labels: Labels | undefined, codebookId: number | null, spans?: ReadonlyMap<string, SpanAnswer>) =>
  c.json ? answerJson(value) : answerText(value, c.item, c.label && labels ? labels.writer(c.variable, codebookId) : asIs, spans);

/** Question names in codebook order (the live codebook's, if given). */
export function questionOrder(items: TopLevelItem[] | undefined): string[] {
  return items ? [...collectQuestions(items).questions.keys()] : [];
}

/**
 * Annotations as a table: a row per unit and coder (in the order the coder
 * first answered the unit), with the unit version they saw, when they first
 * and last answered it, the codebook version, and a column per question.
 */
export function annotationsTable(
  annotations: AnnotationRow[],
  coders: CoderProgress[],
  order: string[] = [],
  labels?: Labels,
  nested: ReadonlySet<string> = new Set(),
): Table {
  const coderById = new Map(coders.map((c) => [c.id, c]));
  // Per answer also the codebook version it was given under: its labels are the ones its coder saw.
  // And the device of the latest answer: a unit is submitted from one device at a time.
  const byUnitCoder = new Map<
    string,
    { first: AnnotationRow; last: Date; deviceId: number | null; values: Map<string, VariableValue>; codebooks: Map<string, number | null> }
  >();
  // Answers outside unit loops (no unit) are in coders.csv.
  for (const a of annotations) {
    if (a.unitId === null) continue;
    const key = `${a.unitId}/${a.coderId}`;
    let row = byUnitCoder.get(key);
    if (!row) byUnitCoder.set(key, (row = { first: a, last: new Date(a.updated), deviceId: a.deviceId ?? null, values: new Map(), codebooks: new Map() }));
    row.values.set(a.variable, a.value);
    row.codebooks.set(a.variable, a.codebookId);
    if (new Date(a.updated) > row.last) {
      row.last = new Date(a.updated);
      row.deviceId = a.deviceId ?? null;
    }
  }
  const columns = answerColumns(
    [...byUnitCoder.values()].flatMap((r) => [...r.values]),
    order,
    labels,
    nested,
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
      "device_id",
      ...columns.map(header),
    ],
    rows: [...byUnitCoder.values()].map(({ first, last, deviceId, values, codebooks }) => {
      // The unit's spans, by id, so relations can name them by their text
      const spans = new Map([...values.values()].flatMap((v) => (v.spans ?? []).map((s) => [s.id, s] as const)));
      return [
      first.externalId ?? "",
      first.unitVersionId === null ? "" : String(first.unitVersionId),
      String(first.coderId),
      first.participantId ?? "",
      coderById.get(first.coderId)?.inviteLabel ?? "",
      time(first.created),
      time(last),
      first.codebookId === null ? "" : String(first.codebookId),
      deviceId === null ? "" : String(deviceId),
      ...columns.map((c) => cellOf(values.get(c.variable), c, labels, codebooks.get(c.variable) ?? first.codebookId, spans)),
      ];
    }),
  };
}

/**
 * Answers a researcher reset (`retired=true` rows with `retiredAt`), long:
 * a row per answer, with when it was given and reset. The live answers that
 * replaced them, if any, are in annotations.csv.
 */
export function resetAnswersTable(annotations: AnnotationRow[], labels?: Labels): Table {
  const reset = annotations.filter((a) => a.retiredAt);
  return {
    headers: ["unit_id", "unit_version_id", "coder_id", "participant_id", "variable", "value", ...(labels ? ["value_label"] : []), "value_json", "codebook_id", "answered", "reset_at"],
    rows: reset.map((a) => [
      a.externalId ?? "",
      a.unitVersionId === null ? "" : String(a.unitVersionId),
      String(a.coderId),
      a.participantId ?? "",
      a.variable,
      answerText(a.value),
      ...(labels ? [answerText(a.value, undefined, labels.writer(a.variable, a.codebookId))] : []),
      answerJson(a.value),
      a.codebookId === null ? "" : String(a.codebookId),
      time(a.updated),
      time(a.retiredAt),
    ]),
  };
}

/**
 * Coders as a table: who they are (invitation, participant id), when they
 * started and were last active, how their session ended, units finished
 * per loop, and their coder-level answers (survey questions, `auto` groups;
 * labels from the live codebook).
 */
export function codersTable(coders: CoderProgress[], order: string[] = [], labels?: Labels, nested: ReadonlySet<string> = new Set()): Table {
  const loops = [...new Set(coders.flatMap((c) => Object.keys(c.finished)))].sort();
  // The URL parameters invitations required, by their $session name
  const sessionNames = [...new Set(coders.flatMap((c) => Object.keys(c.session ?? {})))].sort();
  const columns = answerColumns(
    coders.flatMap((c) => Object.entries(c.variables)),
    order,
    labels,
    nested,
  );
  return {
    headers: [
      "coder_id",
      "participant_id",
      "email",
      "invitation",
      "started",
      "last_active",
      "ended",
      "ended_at",
      "deletion_requested",
      ...sessionNames.map((n) => `session.${n}`),
      ...loops.map((l) => `finished_${l}`),
      ...columns.map(header),
    ],
    rows: coders.map((c) => [
      String(c.id),
      c.participantId ?? "",
      c.email ?? "",
      c.inviteLabel ?? "",
      time(c.started),
      time(c.lastActive),
      c.ended?.outcome ?? "",
      time(c.ended?.at),
      time(c.deletionRequest?.at),
      ...sessionNames.map((n) => c.session?.[n] ?? ""),
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

/** The devices coders used (`device_id` in annotations.csv): coarse details, when each joined its session. */
export function devicesTable(devices: Device[]): Table {
  return {
    headers: ["device_id", "coder_id", "device_type", "browser", "os", "first_used"],
    rows: devices.map((d) => [String(d.id), String(d.coderId), d.type ?? "", d.browser ?? "", d.os ?? "", time(d.created)]),
  };
}

/** The deletion log: coders whose data was deleted, so they can be deleted from earlier downloads too. */
export function deletedCodersTable(deletions: CoderDeletion[]): Table {
  return {
    headers: ["coder_id", "participant_id", "email", "requested_at", "deleted_at", "deleted_by", "answers"],
    rows: deletions.map((d) => [
      String(d.coderId),
      d.participantId ?? "",
      d.email ?? "",
      time(d.requestedAt),
      time(d.deletedAt),
      d.deletedBy ?? "",
      String(d.answers),
    ]),
  };
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
coders.csv       A row per coder: participant id, email (coders who logged
                 in), invitation, started, last
                 active, how their session ended (complete, screenout or
                 quit), when they asked for their answers to be deleted
                 (deletion_requested; not done yet), the URL parameters their invitation
                 required (session.<name>), units finished per loop, and
                 their answers outside unit loops.
units.csv        The units as coders saw them (only the fields the codebook
                 used), a row per version: a unit replaced after it was coded
                 has a row per version. Join annotations on unit_version_id.
variables.csv    Per codebook version, question and option: the question text,
                 the stored value and its label.
devices.csv      The devices coders used: device type (phone, tablet,
                 desktop), browser and operating system, and when each
                 joined its coder's session (a coder who continued on
                 another device has several). Join annotations on device_id
                 (the device of the unit's latest answer).
deleted_coders.csv  Coders whose data was deleted from AnnoTinder (for
                 instance a participant who withdrew), by coder_id and
                 participant_id: delete them from earlier downloads too.
reset_answers.csv  (if included) Answers a researcher reset, a row per
                 answer, with when it was given (answered) and reset
                 (reset_at). Units are coded again after a reset; the new
                 answers are in annotations.csv.

Answers are the stored values; several answers are joined with "; ", spans
are written as "value: text", relations as "value: from → to" (the spans'
texts), a confirm question as true, and questions a condition skipped are
empty. Questions with spans, relations or several answers also have a _json
column with the full answer: spans with their field and, per fragment, the
offset and length in that field of the unit version (units.csv), relations
with the ids of their spans.
Join annotations and coders on coder_id. Times are UTC (ISO 8601).
`;
}

/** A table as CSV (RFC 4180 quoting), with a byte order mark so spreadsheet programs read it as UTF-8. */
export function toCsv(table: Table): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [table.headers, ...table.rows].map((row) => row.map(cell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
