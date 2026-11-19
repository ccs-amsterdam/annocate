import {
  ALL_UNITS_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  GOLD_SET,
  coderAccess,
  designSetColumns,
  loopShareColumns,
  notSetColumns,
  sessionColumns,
  sessionItem,
  collectQuestions,
  goldColumn,
  parseAnswerKey,
  answerKeyProblems,
  practiceColumn,
  SetGroupNameSchema,
  loopTitle,
  setKey,
  unitLoops,
  type DesignItem,
  type SetGroupResponse,
  type UnitField,
  type UnitSet,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { HttpError } from "./http.js";
import { getUnitFields, lockUnits, servedUnits, setUnitFields } from "./units.js";

// Set groups (docs/plans/sets-and-session-parameters.md §1): sets
// (`unit_sets`: group, name) and their units (`unit_set_members`), with an
// optional position. A set is in position order if its units have
// positions, else in the units' order. Two copies (docs/plans/design.md §5):
// the draft's, and the deployed (`live`) ones a deploy copies from it.

interface Row {
  grp: string;
  name: string;
  unit_id: number;
  position: number | null;
}

/** The study's groups with their sets, in order (groups and sets by name): the draft's, or the deployed ones (`live`). */
export async function listSetGroups(sql: Sql, studyId: number, live = false): Promise<SetGroupResponse[]> {
  // Empty sets too (a set without units yet still names a link, a set to assign)
  const rows = await sql.query<Omit<Row, "unit_id"> & { unit_id: number | null }>(
    `SELECT s.grp, s.name, m.unit_id, m.position FROM unit_sets s LEFT JOIN unit_set_members m ON m.set_id = s.id
     WHERE s.study_id = $1 AND s.live = $2 ORDER BY s.grp, s.name, m.position NULLS LAST, m.unit_id`,
    [studyId, live],
  );
  const groups = new Map<string, Map<string, UnitSet>>();
  for (const r of rows) {
    if (!groups.has(r.grp)) groups.set(r.grp, new Map());
    const sets = groups.get(r.grp)!;
    if (!sets.has(r.name)) sets.set(r.name, { name: r.name, unitIds: [], ordered: false });
    const set = sets.get(r.name)!;
    if (r.unit_id !== null) set.unitIds.push(r.unit_id);
    if (r.position !== null) set.ordered = true;
  }
  return [...groups].map(([name, sets]) => ({ name, sets: [...sets.values()] }));
}

/** The sets of a group (names), without the reserved ones: the draft's, or the deployed ones (`live`). */
export async function groupSets(sql: Sql, studyId: number, group: string, live = false): Promise<string[]> {
  const rows = await sql.query<{ name: string }>(
    "SELECT name FROM unit_sets WHERE study_id = $1 AND live = $2 AND grp = $3 AND name NOT LIKE '\\_%' ORDER BY name",
    [studyId, live, group],
  );
  return rows.map((r) => r.name);
}

/**
 * Makes or replaces a set column of the draft: its sets' units, in order
 * (positions for ordered sets). Units must be the draft's. The column is a
 * unit field of type `set` in the draft design (`declare`, the default).
 */
export async function putSetGroup(sql: Sql, studyId: number, group: string, sets: UnitSet[], options: { declare?: boolean } = {}): Promise<void> {
  await lockUnits(sql, studyId, "write");
  if (!SetGroupNameSchema.safeParse(group).success) throw new HttpError(400, `'${group}' is not a column name: letters, digits and _, starting with a letter`);
  if (options.declare !== false) {
    const fields = await getUnitFields(sql, studyId);
    const field = fields.find((f) => f.name === group);
    if (field && field.type !== "set") throw new HttpError(409, `'${group}' is a ${field.type} field of the units, not a set column`);
    if (!field) await setUnitFields(sql, studyId, [...fields, { name: group, type: "set" }]);
  }
  const names = sets.map((s) => s.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice !== undefined) throw new HttpError(400, `Set '${twice}' is given twice`);
  const ids = [...new Set(sets.flatMap((s) => s.unitIds))];
  if (ids.length > 0) {
    const own = new Set(
      (await sql.query<{ id: number }>("SELECT id FROM units WHERE study_id = $1 AND id = ANY($2) AND in_draft", [studyId, ids])).map((r) => r.id),
    );
    const foreign = ids.filter((id) => !own.has(id));
    if (foreign.length > 0) throw new HttpError(400, `Not units of this study: ${foreign.slice(0, 10).join(", ")}`);
  }
  await sql.query("DELETE FROM unit_sets WHERE study_id = $1 AND NOT live AND grp = $2", [studyId, group]);
  for (const set of sets) {
    const created = await one<{ id: number }>(sql, "INSERT INTO unit_sets (study_id, live, grp, name) VALUES ($1, false, $2, $3) RETURNING id", [
      studyId,
      group,
      set.name,
    ]);
    const unitIds = [...new Set(set.unitIds)];
    if (unitIds.length === 0) continue;
    await sql.query(
      `INSERT INTO unit_set_members (set_id, unit_id, position) SELECT $1, * FROM unnest($2::int[], $3::int[])`,
      [created!.id, unitIds, unitIds.map((_, i) => (set.ordered ? i + 1 : null))],
    );
  }
}

/** Deletes a set column of the draft, and its field. */
export async function deleteSetGroup(sql: Sql, studyId: number, group: string): Promise<boolean> {
  await lockUnits(sql, studyId, "write");
  const deleted = await sql.query("DELETE FROM unit_sets WHERE study_id = $1 AND NOT live AND grp = $2 RETURNING id", [studyId, group]);
  const fields = await getUnitFields(sql, studyId);
  const declared = fields.some((f) => f.name === group && f.type === "set");
  if (declared) await setUnitFields(sql, studyId, fields.filter((f) => f.name !== group));
  return deleted.length > 0 || declared;
}

/**
 * The sets as the runtime reads them, keyed `group/set`, plus all its units
 * (`__all__`): deployed (`live`), or the draft's (previews).
 */
export async function runtimeSets(sql: Sql, studyId: number, live: boolean): Promise<{ name: string; unitIds: number[] }[]> {
  const allUnitIds = (
    live
      ? await sql.query<{ id: number }>("SELECT DISTINCT unit_id AS id FROM unit_versions WHERE study_id = $1 AND to_deploy IS NULL ORDER BY unit_id", [studyId])
      : await sql.query<{ id: number }>("SELECT id FROM units WHERE study_id = $1 AND in_draft ORDER BY id", [studyId])
  ).map((r) => r.id);
  const groups = await listSetGroups(sql, studyId, live);
  return [
    { name: ALL_UNITS_SET, unitIds: allUnitIds },
    ...groups.flatMap((g) => g.sets.map((s) => ({ name: setKey(g.name, s.name), unitIds: s.unitIds }))),
  ];
}

/**
 * Checks of a design about to be deployed against the study's set columns
 * (docs/plans/unit-assignment.md §5). Errors: a column the design selects
 * units by isn't a set column; coder values mix email addresses and other
 * names; a condition's fixed values aren't all in its column. Warnings: a
 * column without values, units no session gets, values of a column a
 * condition doesn't list, special units a loop places but the columns
 * don't have, and right answers missing or not fitting their question.
 */
export async function assignmentChecks(
  sql: Sql,
  studyId: number,
  items: DesignItem[],
  fields: UnitField[],
  live = false,
): Promise<{ errors: string[]; warnings: string[] }> {
  const groups = new Map((await listSetGroups(sql, studyId, live)).map((g) => [g.name, g.sets]));
  const valuesOf = (column: string) => (groups.get(column) ?? []).filter((s) => !s.name.startsWith("_")).map((s) => s.name);
  const unitsIn = (column: string, set: string) => (groups.get(column) ?? []).find((s) => s.name === set)?.unitIds ?? [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const notSet = notSetColumns(items, fields);
  for (const column of notSet) errors.push(`Column '${column}' selects units, but it is a ${fields.find((f) => f.name === column)?.type} field: make it a set column.`);
  const columns = designSetColumns(items).filter((c) => !notSet.includes(c));
  for (const column of columns) {
    if (valuesOf(column).length === 0) warnings.push(`Set column '${column}' has no values yet, so no session gets units by it until it has.`);
  }

  const session = sessionItem(items);
  if (session?.coders && coderAccess(valuesOf(session.coders.column)) === "mixed") {
    errors.push(`The coders (column '${session.coders.column}') are partly email addresses: make them all email addresses (coders sign in) or none (a link each).`);
  }
  // Conditions' fixed values, and the column's other values
  const random = collectQuestions(items).questions;
  const linked = [
    ...(session?.conditions ?? []).flatMap((c) => (c.units ? [{ name: c.name, column: c.units, values: c.values === "free" ? null : c.values }] : [])),
    ...[...random].flatMap(([name, v]) =>
      v.type === "random_condition" && v.units ? [{ name, column: v.units, values: v.options ? v.options.map((o) => o.value) : null }] : [],
    ),
  ];
  for (const { name, column, values } of linked) {
    if (values === null || valuesOf(column).length === 0) continue;
    const missing = values.filter((v) => !valuesOf(column).includes(v));
    if (missing.length > 0) errors.push(`Condition '${name}': column '${column}' has no units for ${missing.map((v) => `'${v}'`).join(", ")}.`);
    const unlisted = valuesOf(column).filter((v) => !values.includes(v));
    if (unlisted.length > 0) warnings.push(`Condition '${name}' doesn't list ${unlisted.map((v) => `'${v}'`).join(", ")} of column '${column}': no session gets those units.`);
  }
  // Units no session gets: in no set of a column every session is selected by
  const all = (await sql.query<{ id: number }>(
    live
      ? "SELECT DISTINCT unit_id AS id FROM unit_versions WHERE study_id = $1 AND to_deploy IS NULL"
      : "SELECT id FROM units WHERE study_id = $1 AND in_draft",
    [studyId],
  )).map((r) => r.id);
  for (const column of new Set([...sessionColumns(session).map((c) => c.column), ...linked.map((l) => l.column)])) {
    if (notSet.includes(column) || valuesOf(column).length === 0) continue;
    const placed = new Set((groups.get(column) ?? []).flatMap((s) => s.unitIds));
    const none = all.filter((id) => !placed.has(id)).length;
    if (none > 0) warnings.push(`${none} unit${none === 1 ? " has" : "s have"} no value in column '${column}': no session gets ${none === 1 ? "it" : "them"}.`);
  }

  // Special units the loops place
  const special = (set: string) => [...new Set([...groups.keys()].flatMap((g) => unitsIn(g, set)))];
  const shares = loopShareColumns(items);
  const { questions } = collectQuestions(items);
  for (const { key, loop } of unitLoops(items)) {
    const title = loopTitle(loop, key);
    for (const branch of loop.units) {
      for (const [set, settings, column] of [
        [PRACTICE_SET, branch.practice, practiceColumn],
        [GOLD_SET, branch.gold, goldColumn],
      ] as const) {
        if (!settings) continue;
        const units = special(set);
        if (units.length === 0) {
          warnings.push(`Loop '${title}': ${set === GOLD_SET ? "gold" : "practice"} units are on, but no set column has ${set} units.`);
          continue;
        }
        const rows = (await servedUnits(sql, studyId, live, units)).sort((a, b) => a.id - b.id);
        for (const question of settings.questions ?? []) {
          const empty = rows.filter((r) => parseAnswerKey(r.data[column(question)]) === null);
          // Right answers that can never be right: not an option, not a number, a range without options in it
          const variable = questions.get(question) as Parameters<typeof answerKeyProblems>[1];
          const odd = rows.flatMap((r) => {
            const answer = parseAnswerKey(r.data[column(question)]);
            return answer ? answerKeyProblems(answer, variable).map((v) => `${r.external_id}: ${v}`) : [];
          });
          if (odd.length > 0) {
            warnings.push(
              `Loop '${title}': ${column(question)} has answers that don't fit '${question}' (${odd.slice(0, 5).join(", ")}${odd.length > 5 ? ", …" : ""}): those can never be right.`,
            );
          }
          if (empty.length === 0) continue;
          const which = empty.slice(0, 5).map((r) => r.external_id).join(", ") + (empty.length > 5 ? ", …" : "");
          warnings.push(
            `Loop '${title}': ${empty.length} ${set} unit${empty.length === 1 ? " has" : "s have"} no right answer for '${question}' in column ${column(question)} (${which})${set === GOLD_SET ? ": they aren't checked" : ": no feedback on them"}.`,
          );
        }
      }
      if (!branch.overlap || branch.overlap.placement === "disabled") continue;
      // The session's columns, or (no column divides the units) every column
      const shareColumns = (shares.get(key) ?? []).map((c) => c.column);
      const overlapColumns = shareColumns.length > 0 ? shareColumns : [...groups.keys()];
      const n = new Set(overlapColumns.flatMap((c) => unitsIn(c, OVERLAP_SET))).size;
      if (n === 0) warnings.push(`Loop '${title}': the overlap is on, but ${overlapColumns.length === 0 ? "no set column has overlap units" : `no ${OVERLAP_SET} units in ${overlapColumns.map((c) => `'${c}'`).join(", ")}`}.`);
      else if (branch.overlap.expect !== undefined && n < branch.overlap.expect) {
        warnings.push(`Loop '${title}': ${n} overlap units; ${branch.overlap.expect} are recommended.`);
      }
    }
  }
  return { errors, warnings };
}
