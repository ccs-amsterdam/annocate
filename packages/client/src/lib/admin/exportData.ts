import {
  cellsFromSets,
  collectQuestions,
  loopTitle,
  optionLabel,
  unitLoops,
  type SetGroupResponse,
  type AnnotationRow,
  type CoderDeletion,
  type Device,
  type CoderProgress,
  type DisplayChange,
  type TopLevelItem,
  type UnitVersion,
  type VariableValue,
} from "@annotinder/contracts";
import { answerColumns, answerJson, answerText, cellOf, header, optionsOf, type Labels } from "./exportAnswers";

// The researcher UI's data download (docs/client.md §7, "Results"): one zip
// with the researcher API's data as wide tables, the way people analyse
// them in R, SPSS or a spreadsheet:
//
// - annotations: a row per unit and coder, a column per question;
// - coders: a row per coder, with their coder-level answers;
// - units: the unit versions answers were given on (what coders saw);
// - variables: per design version, question and option its label;
// - devices, timings, display changes, deleted coders, and optionally
//   reset answers.
//
// How answers become cells is in exportAnswers.ts; README.txt in
// exportReadme.ts. results/DownloadView.tsx puts them all in the zip.

/** A table for a CSV file. */
export interface Table {
  headers: string[];
  rows: string[][];
}

const time = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : "");

/**
 * A design version's number as people see it (v1, v2, ...: `design_version`
 * in the files, as in `designs/v<n>.json`), from its id.
 */
export type VersionOf = (designVersionId: number) => number | null;
const versionCell = (versionOf: VersionOf, id: number | null) => (id === null ? "" : String(versionOf(id) ?? ""));

/**
 * Annotations as a table: a row per unit and coder (in the order the coder
 * first answered the unit), with the unit version they saw, when they first
 * and last answered it, the design version, and a column per question.
 */
export function annotationsTable(
  annotations: AnnotationRow[],
  coders: CoderProgress[],
  order: string[] = [],
  labels?: Labels,
  nested: ReadonlySet<string> = new Set(),
  versionOf: VersionOf = (id) => id,
  numeric: ReadonlySet<string> = new Set(),
): Table {
  const coderById = new Map(coders.map((c) => [c.id, c]));
  // Per answer also the design version it was given under: its labels are the ones its coder saw.
  // And the device of the latest answer: a unit is submitted from one device at a time.
  const byUnitCoder = new Map<
    string,
    {
      first: AnnotationRow;
      last: Date;
      deviceId: number | null;
      values: Map<string, VariableValue>;
      designVersions: Map<string, number | null>;
    }
  >();
  const unitTimes = unitTimings(annotations);
  // Answers outside unit loops (no unit) are in coders.csv.
  for (const a of annotations) {
    if (a.unitId === null) continue;
    const key = `${a.unitId}/${a.sessionId}`;
    let row = byUnitCoder.get(key);
    if (!row)
      byUnitCoder.set(
        key,
        (row = {
          first: a,
          last: new Date(a.updated),
          deviceId: a.deviceId ?? null,
          values: new Map(),
          designVersions: new Map(),
        }),
      );
    row.values.set(a.variable, a.value);
    row.designVersions.set(a.variable, a.designVersionId);
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
      "session_id",
      "coder",
      "link",
      "first_answer",
      "last_change",
      "design_version",
      "device_id",
      "unit_ms_client",
      "unit_ms_server",
      ...columns.map(header),
    ],
    rows: [...byUnitCoder.values()].map(({ first, last, deviceId, values, designVersions }) => {
      const times = unitTimes.get(`${first.unitId}/${first.sessionId}`);
      // The unit's spans, by id, so relations can name them by their text
      const spans = new Map([...values.values()].flatMap((v) => (v.spans ?? []).map((s) => [s.id, s] as const)));
      return [
        first.externalId ?? "",
        first.unitVersionId === null ? "" : String(first.unitVersionId),
        String(first.sessionId),
        first.coder ?? "",
        coderById.get(first.sessionId)?.linkLabel ?? "",
        time(first.created),
        time(last),
        versionCell(versionOf, first.designVersionId),
        deviceId === null ? "" : String(deviceId),
        times?.client == null ? "" : String(times.client),
        times?.server == null ? "" : String(times.server),
        ...columns.map((c) =>
          cellOf(
            values.get(c.variable),
            c,
            labels,
            designVersions.get(c.variable) ?? first.designVersionId,
            numeric,
            spans,
          ),
        ),
      ];
    }),
  };
}

/**
 * Answers a researcher reset (`retired=true` rows with `retiredAt`), long:
 * a row per answer, with when it was given and reset. The live answers that
 * replaced them, if any, are in annotations.csv.
 */
export function resetAnswersTable(
  annotations: AnnotationRow[],
  labels?: Labels,
  versionOf: VersionOf = (id) => id,
  numeric: ReadonlySet<string> = new Set(),
): Table {
  const reset = annotations.filter((a) => a.retiredAt);
  return {
    headers: [
      "unit_id",
      "unit_version_id",
      "session_id",
      "coder",
      "variable",
      "value",
      ...(labels ? ["value_label"] : []),
      "value_json",
      "design_version",
      "answered",
      "reset_at",
    ],
    rows: reset.map((a) => [
      a.externalId ?? "",
      a.unitVersionId === null ? "" : String(a.unitVersionId),
      String(a.sessionId),
      a.coder ?? "",
      a.variable,
      answerText(a.value),
      ...(labels ? [answerText(a.value, undefined, labels.writer(a.variable, a.designVersionId))] : []),
      answerJson(a.value, numeric.has(a.variable)),
      versionCell(versionOf, a.designVersionId),
      time(a.updated),
      time(a.retiredAt),
    ]),
  };
}

/**
 * Coders as a table: who they are (link, coder), when they
 * started and were last active, how their session ended, units finished
 * per loop, and their coder-level answers (survey questions, `auto` groups;
 * labels from the live design version).
 */
export function codersTable(
  coders: CoderProgress[],
  order: string[] = [],
  labels?: Labels,
  nested: ReadonlySet<string> = new Set(),
  numeric: ReadonlySet<string> = new Set(),
): Table {
  // Natural order, so "Unit loop 2" comes before "Unit loop 10"
  // The live design's loops in their order (the server lists them so): columns by position, `finished_loop1`,
  // since labels can repeat and hold spaces; the variables table has each loop's number and title
  const loops = [...new Set(coders.flatMap((c) => Object.keys(c.finished)))];
  // Units of the special sets each coder finished (overlap, gold, practice)
  const specials = (["overlap", "gold", "practice"] as const).filter((kind) => coders.some((c) => c.special?.[kind]));
  // The session's values (URL parameters, source) by their $session name; its coder has its own column
  const sessionNames = [...new Set(coders.flatMap((c) => Object.keys(c.session ?? {})))]
    .filter((n) => n !== "coder")
    .sort();
  const columns = answerColumns(
    coders.flatMap((c) => Object.entries(c.variables)),
    order,
    labels,
    nested,
  );
  return {
    headers: [
      "session_id",
      "coder",
      "email",
      "link",
      "started",
      "last_active",
      "ended",
      "ended_at",
      "deletion_requested",
      "display",
      ...sessionNames.map((n) => `session.${n}`),
      ...loops.map((_, i) => `finished_loop${i + 1}`),
      ...specials.map((kind) => `${kind}_finished`),
      ...columns.map(header),
    ],
    rows: coders.map((c) => [
      String(c.id),
      c.coder ?? "",
      c.email ?? "",
      c.linkLabel ?? "",
      time(c.started),
      time(c.lastActive),
      c.ended?.outcome ?? "",
      time(c.ended?.at),
      time(c.deletionRequest?.at),
      displaySummary(c.display ?? []),
      ...sessionNames.map((n) => c.session?.[n] ?? ""),
      ...loops.map((l) => String(c.finished[l] ?? 0)),
      ...specials.map((kind) => String(c.special?.[kind]?.done ?? 0)),
      ...columns.map((col) => cellOf(c.variables[col.variable], col, labels, null, numeric)),
    ]),
  };
}

/**
 * The unit versions answers were given on: a row per version (a unit
 * replaced after it was coded has several), with the fields as shown.
 * Join the annotations on `unit_version_id`.
 */
export function unitsTable(
  versions: UnitVersion[],
  annotations: AnnotationRow[],
  groups: SetGroupResponse[] = [],
): Table {
  const used = new Set(annotations.map((a) => a.unitVersionId));
  const coded = versions.filter((v) => used.has(v.id));
  const fields = [...new Set(coded.flatMap((v) => Object.keys(v.data)))];
  // A column per set group: the unit's sets, as in a sets column of a CSV
  const cells = groups.map((g) => cellsFromSets(g.sets));
  return {
    // Set columns under their own name (they are declared unit fields, not in the units' data)
    headers: [
      "unit_version_id",
      "unit_id",
      "hash",
      "deployed",
      ...fields,
      ...groups.map((g) => (fields.includes(g.name) ? `${g.name}_set` : g.name)),
    ],
    rows: coded.map((v) => [
      String(v.id),
      v.externalId,
      v.hash,
      time(v.created),
      ...fields.map((f) => (v.data[f] === null || v.data[f] === undefined ? "" : String(v.data[f]))),
      ...cells.map((c) => c.get(v.unitId) ?? ""),
    ]),
  };
}

/**
 * The questions of each design version and their options: a row per
 * version, question (a scale: per item, `question.item`) and option, with
 * its label; questions without options have one row. The loop is the one
 * the question is in, by number and title (empty: asked once per coder).
 */
export function variablesTable(
  designVersions: ReadonlyMap<number, TopLevelItem[]>,
  versionOf: VersionOf = (id) => id,
): Table {
  const rows: string[][] = [];
  for (const [id, items] of [...designVersions].sort(([a], [b]) => a - b)) {
    const { questions, loopOf } = collectQuestions(items);
    const titles = new Map(unitLoops(items).map(({ key, loop }) => [key, loopTitle(loop, key)]));
    for (const [name, variable] of questions) {
      // The loop's number (as in coders' `finished_loop<n>`) and its title; empty outside loops
      const number = loopOf.get(name) ?? "";
      const loop = titles.get(number) ?? "";
      const text = "question" in variable && typeof variable.question === "string" ? variable.question : "";
      const names = variable.type === "scale" ? variable.items.map((i) => `${name}.${i.name}`) : [name];
      const options = optionsOf(variable) ?? [];
      for (const n of names) {
        if (options.length === 0)
          rows.push([versionCell(versionOf, id), number, loop, n, variable.type, text, "", "", ""]);
        for (const o of options)
          rows.push([
            versionCell(versionOf, id),
            number,
            loop,
            n,
            variable.type,
            text,
            String(o.value),
            optionLabel(o),
            "special" in o && o.special ? String(o.special) : "",
          ]);
      }
    }
  }
  return {
    headers: ["design_version", "loop_number", "loop", "variable", "type", "question", "value", "label", "special"],
    rows,
  };
}

/** Leeway when comparing the browser's times with the server's (clocks, network). */
const TIMING_TOLERANCE_MS = 2000;

/**
 * Per unit and coder: the time the browser measured on its questions (on
 * screen, summed; null without timings), and the server's bound: from
 * handing the unit out to the last answer (null if not known).
 */
function unitTimings(
  annotations: AnnotationRow[],
): Map<string, { client: number | null; hidden: number; server: number | null }> {
  const out = new Map<string, { client: number | null; hidden: number; server: number | null }>();
  for (const a of annotations) {
    if (a.unitId === null) continue;
    const key = `${a.unitId}/${a.sessionId}`;
    let t = out.get(key);
    if (!t) out.set(key, (t = { client: null, hidden: 0, server: null }));
    if (a.timing) {
      t.client = (t.client ?? 0) + a.timing.totalMs;
      t.hidden += a.timing.hiddenMs;
    }
    if (a.servedAt) t.server = Math.max(t.server ?? 0, new Date(a.updated).getTime() - new Date(a.servedAt).getTime());
  }
  return out;
}

/**
 * Response times, a row per answer the browser timed (docs/coder-identity.md
 * §10), with the server's bound: for an answer in a unit, the unit's (from
 * handing it out to its last answer); for one outside units, the time since
 * the coder's previous answer (or their start). `exceeds_server`: the
 * browser claims more time than the server saw (unit: all its questions,
 * hidden time included; outside units: until the first answer), a sign of
 * a tampered client.
 */
export function timingsTable(annotations: AnnotationRow[], coders: CoderProgress[]): Table {
  const started = new Map(coders.map((c) => [c.id, c.started ? new Date(c.started).getTime() : null]));
  const answeredAt = new Map<number, number[]>();
  for (const a of annotations) {
    const list = answeredAt.get(a.sessionId) ?? [];
    list.push(new Date(a.created).getTime());
    answeredAt.set(a.sessionId, list);
  }
  const units = unitTimings(annotations);
  const ms = (v: number | null) => (v === null ? "" : String(Math.round(v)));
  const rows = annotations.flatMap((a) => {
    const t = a.timing;
    if (!t) return [];
    let server: number | null;
    let exceeds: boolean | null;
    if (a.unitId !== null) {
      const unit = units.get(`${a.unitId}/${a.sessionId}`);
      server = unit?.server ?? null;
      exceeds =
        server === null || unit?.client == null ? null : unit.client + unit.hidden > server + TIMING_TOLERANCE_MS;
    } else {
      const created = new Date(a.created).getTime();
      const before = (answeredAt.get(a.sessionId) ?? []).filter((v) => v < created);
      const from = before.length > 0 ? Math.max(...before) : (started.get(a.sessionId) ?? null);
      server = from === null ? null : created - from;
      exceeds = server === null || t.firstMs === null ? null : t.firstMs > server + TIMING_TOLERANCE_MS;
    }
    return [
      [
        a.externalId ?? "",
        String(a.sessionId),
        a.coder ?? "",
        a.variable,
        ms(t.firstMs),
        ms(t.totalMs),
        ms(t.hiddenMs),
        String(t.edits),
        t.tries === undefined ? "" : String(t.tries),
        ms(server),
        exceeds === null ? "" : String(exceeds),
      ],
    ];
  });
  return {
    headers: [
      "unit_id",
      "session_id",
      "coder",
      "variable",
      "first_ms",
      "total_ms",
      "hidden_ms",
      "edits",
      "practice_tries",
      "server_ms",
      "exceeds_server",
    ],
    rows,
  };
}

/** A session's displays in a cell: each distinct one once, in order ("numbers, wide; numpad, wide"). */
export function displaySummary(changes: readonly DisplayChange[]): string {
  const shown = changes.map((d) => [d.keys, d.width, d.theme].filter(Boolean).join(", "));
  return [...new Set(shown)].join("; ");
}

/** How coders' screens looked, a row per change: join answers on session_id and their time. */
export function displayChangesTable(coders: CoderProgress[]): Table {
  return {
    headers: ["session_id", "at", "keys", "width", "theme"],
    rows: coders.flatMap((c) =>
      (c.display ?? []).map((d) => [String(c.id), d.at, d.keys, d.width ?? "", d.theme ?? ""]),
    ),
  };
}

/** The devices coders used (`device_id` in annotations.csv): coarse details, when each joined its session. */
export function devicesTable(devices: Device[]): Table {
  return {
    headers: ["device_id", "session_id", "device_type", "browser", "os", "first_used"],
    rows: devices.map((d) => [
      String(d.id),
      String(d.sessionId),
      d.type ?? "",
      d.browser ?? "",
      d.os ?? "",
      time(d.created),
    ]),
  };
}

/** The deletion log: coders whose data was deleted, so they can be deleted from earlier downloads too. */
export function deletedCodersTable(deletions: CoderDeletion[]): Table {
  return {
    headers: ["session_id", "coder", "requested_at", "deleted_at", "deleted_by", "answers"],
    rows: deletions.map((d) => [
      String(d.sessionId),
      d.coder ?? "",
      time(d.requestedAt),
      time(d.deletedAt),
      d.deletedBy ?? "",
      String(d.answers),
    ]),
  };
}

/**
 * A table as CSV (RFC 4180 quoting), UTF-8, written as it is: for R, Python
 * and the like. For spreadsheet programs the download offers .xlsx instead
 * (xlsx.ts), whose cells are never run as formulas.
 */
export function toCsv(table: Table): string {
  const quote = (v: string) => (/[",\n\r]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [table.headers, ...table.rows].map((row) => row.map(quote).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
