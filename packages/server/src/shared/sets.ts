import {
  ALL_UNITS_SET,
  PRACTICE_SET,
  GOLD_SET,
  coderAccess,
  inviteOf,
  designSetColumns,
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
  loopUnits,
  type DesignItem,
  type SetGroupResponse,
  type UnitField,
  type UnitSet,
} from "@annotinder/contracts";
import { and, asc, eq, notLike, sql } from "drizzle-orm";
import { anyOf } from "../db/sql.js";
import type { Db } from "../db/index.js";
import { unitSetMembers, unitSets, units } from "../db/schema/index.js";
import { HttpError } from "./http.js";
import { getUnitFields, lockUnits, servedUnits, setUnitFields, unitIds } from "./units.js";

// Set groups (docs/architecture.md §6.3): sets
// (`unit_sets`: group, name) and their units (`unit_set_members`), with an
// optional position. A set is in position order if its units have
// positions, else in the units' order. Two copies (docs/architecture.md §8.4):
// the draft's, and the deployed (`live`) ones a deploy copies from it.

/** A set column of the draft. */
const draftGroup = (studyId: number, group: string) =>
  and(eq(unitSets.studyId, studyId), eq(unitSets.live, false), eq(unitSets.grp, group));

/** The study's groups with their sets, in order (groups and sets by name): the draft's, or the deployed ones (`live`). */
export async function listSetGroups(db: Db, studyId: number, live = false): Promise<SetGroupResponse[]> {
  // Empty sets too (a set without units yet still names a link, a set to assign)
  const rows = await db
    .select({
      grp: unitSets.grp,
      name: unitSets.name,
      unitId: unitSetMembers.unitId,
      position: unitSetMembers.position,
    })
    .from(unitSets)
    .leftJoin(unitSetMembers, eq(unitSetMembers.setId, unitSets.id))
    .where(and(eq(unitSets.studyId, studyId), eq(unitSets.live, live)))
    .orderBy(
      asc(unitSets.grp),
      asc(unitSets.name),
      sql`${unitSetMembers.position} NULLS LAST`,
      asc(unitSetMembers.unitId),
    );
  const groups = new Map<string, Map<string, UnitSet>>();
  for (const r of rows) {
    if (!groups.has(r.grp)) groups.set(r.grp, new Map());
    const sets = groups.get(r.grp)!;
    if (!sets.has(r.name)) sets.set(r.name, { name: r.name, unitIds: [], ordered: false });
    const set = sets.get(r.name)!;
    if (r.unitId !== null) set.unitIds.push(r.unitId);
    if (r.position !== null) set.ordered = true;
  }
  return [...groups].map(([name, sets]) => ({ name, sets: [...sets.values()] }));
}

/** The sets of a group (names), without the reserved ones: the draft's, or the deployed ones (`live`). */
export async function groupSets(db: Db, studyId: number, group: string, live = false): Promise<string[]> {
  const rows = await db
    .select({ name: unitSets.name })
    .from(unitSets)
    .where(
      and(
        eq(unitSets.studyId, studyId),
        eq(unitSets.live, live),
        eq(unitSets.grp, group),
        notLike(unitSets.name, "\\_%"),
      ),
    )
    .orderBy(asc(unitSets.name));
  return rows.map((r) => r.name);
}

/**
 * Makes or replaces a set column of the draft: its sets' units, in order
 * (positions for ordered sets). Units must be the draft's. The column is a
 * unit field of type `set` in the draft design (`declare`, the default).
 */
export async function putSetGroup(
  db: Db,
  studyId: number,
  group: string,
  sets: UnitSet[],
  options: { declare?: boolean } = {},
): Promise<void> {
  await lockUnits(db, studyId, "write");
  if (!SetGroupNameSchema.safeParse(group).success)
    throw new HttpError(400, `'${group}' is not a column name: letters, digits and _, starting with a letter`);
  if (options.declare !== false) {
    const fields = await getUnitFields(db, studyId);
    const field = fields.find((f) => f.name === group);
    if (field && field.type !== "set")
      throw new HttpError(409, `'${group}' is a ${field.type} field of the units, not a set column`);
    if (!field) await setUnitFields(db, studyId, [...fields, { name: group, type: "set" }]);
  }
  const names = sets.map((s) => s.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice !== undefined) throw new HttpError(400, `Set '${twice}' is given twice`);
  const ids = [...new Set(sets.flatMap((s) => s.unitIds))];
  if (ids.length > 0) {
    const own = new Set(
      (
        await db
          .select({ id: units.id })
          .from(units)
          .where(and(eq(units.studyId, studyId), anyOf(units.id, ids), eq(units.inDraft, true)))
      ).map((r) => r.id),
    );
    const foreign = ids.filter((id) => !own.has(id));
    if (foreign.length > 0) throw new HttpError(400, `Not units of this study: ${foreign.slice(0, 10).join(", ")}`);
  }
  await db.delete(unitSets).where(draftGroup(studyId, group));
  for (const set of sets) {
    const [created] = await db
      .insert(unitSets)
      .values({ studyId, live: false, grp: group, name: set.name })
      .returning({ id: unitSets.id });
    const members = [...new Set(set.unitIds)];
    if (members.length === 0) continue;
    // One array parameter per column: a set can have many units
    const positions = members.map((_, i) => (set.ordered ? i + 1 : null));
    await db.execute(sql`
      INSERT INTO ${unitSetMembers} (set_id, unit_id, position)
      SELECT ${created!.id}, * FROM unnest(${sql.param(members)}::int[], ${sql.param(positions)}::int[])`);
  }
}

/** Deletes a set column of the draft, and its field. */
export async function deleteSetGroup(db: Db, studyId: number, group: string): Promise<boolean> {
  await lockUnits(db, studyId, "write");
  const deleted = await db.delete(unitSets).where(draftGroup(studyId, group)).returning({ id: unitSets.id });
  const fields = await getUnitFields(db, studyId);
  const declared = fields.some((f) => f.name === group && f.type === "set");
  if (declared)
    await setUnitFields(
      db,
      studyId,
      fields.filter((f) => f.name !== group),
    );
  return deleted.length > 0 || declared;
}

/**
 * The sets as the runtime reads them, keyed `group/set`, plus all its units
 * (`__all__`): deployed (`live`), or the draft's (previews).
 */
export async function runtimeSets(
  db: Db,
  studyId: number,
  live: boolean,
): Promise<{ name: string; unitIds: number[] }[]> {
  const allUnitIds = await unitIds(db, studyId, live);
  const groups = await listSetGroups(db, studyId, live);
  return [
    { name: ALL_UNITS_SET, unitIds: allUnitIds },
    ...groups.flatMap((g) => g.sets.map((s) => ({ name: setKey(g.name, s.name), unitIds: s.unitIds }))),
  ];
}

/**
 * Checks of a design about to be deployed against the study's set columns
 * (docs/architecture.md §6.3). Errors: a column the design selects
 * units by isn't a set column; coder values mix email addresses and other
 * names; a random condition's fixed values aren't all in its column. Warnings: a
 * column without values, units no session gets, values of a column a random
 * condition doesn't list, special units a loop places but the columns
 * don't have, and right answers missing or not fitting their question.
 */
export async function assignmentChecks(
  db: Db,
  studyId: number,
  items: DesignItem[],
  fields: UnitField[],
  live = false,
): Promise<{ errors: string[]; warnings: string[] }> {
  const groups = new Map((await listSetGroups(db, studyId, live)).map((g) => [g.name, g.sets]));
  const valuesOf = (column: string) =>
    (groups.get(column) ?? []).filter((s) => !s.name.startsWith("_")).map((s) => s.name);
  const errors: string[] = [];
  const warnings: string[] = [];

  const notSet = notSetColumns(items, fields);
  for (const column of notSet)
    errors.push(
      `Column '${column}' selects units, but it is a ${fields.find((f) => f.name === column)?.type} field: make it a set column.`,
    );
  const columns = designSetColumns(items).filter((c) => !notSet.includes(c));
  for (const column of columns) {
    if (valuesOf(column).length === 0)
      warnings.push(`Set column '${column}' has no values yet, so no session gets units by it until it has.`);
  }

  const session = sessionItem(items);
  const invite = inviteOf(session);
  if (invite.mode === "coders" && invite.link === "login") {
    const access = coderAccess(valuesOf(invite.column));
    if (access === "mixed" || access === "link")
      errors.push(
        `Coders sign in with their email address, but the coders (column '${invite.column}') aren't all email addresses: make them email addresses, or give each coder a link.`,
      );
  }
  // Random conditions linked to a column: their fixed values, and the column's other values
  const { questions } = collectQuestions(items);
  const linked = [...questions].flatMap(([name, v]) =>
    v.type === "random" && v.units
      ? [{ name: `Computed item '${name}'`, column: v.units, values: v.options ? v.options.map((o) => o.value) : null }]
      : [],
  );
  for (const { name, column, values } of linked) {
    if (values === null || valuesOf(column).length === 0) continue;
    const missing = values.filter((v) => !valuesOf(column).includes(v));
    if (missing.length > 0)
      errors.push(`${name}: column '${column}' has no units for ${missing.map((v) => `'${v}'`).join(", ")}.`);
    const unlisted = valuesOf(column).filter((v) => !values.includes(v));
    if (unlisted.length > 0)
      warnings.push(
        `${name} doesn't list ${unlisted.map((v) => `'${v}'`).join(", ")} of column '${column}': no session gets those units.`,
      );
  }
  // Units no session gets: in no set of a column every session is selected by
  const all = await unitIds(db, studyId, live);
  for (const column of new Set([...sessionColumns(session).map((c) => c.column), ...linked.map((l) => l.column)])) {
    if (notSet.includes(column) || valuesOf(column).length === 0) continue;
    const placed = new Set((groups.get(column) ?? []).flatMap((s) => s.unitIds));
    const none = all.filter((id) => !placed.has(id)).length;
    if (none > 0)
      warnings.push(
        `${none} unit${none === 1 ? " has" : "s have"} no value in column '${column}': no session gets ${none === 1 ? "it" : "them"}.`,
      );
  }
  warnings.push(...(await answerKeyWarnings(db, studyId, items, groups, live)));
  return { errors, warnings };
}

/**
 * Warnings about the checks on practice and gold units the loops configure:
 * no such units, or right answers missing or not fitting their question.
 */
async function answerKeyWarnings(
  db: Db,
  studyId: number,
  items: DesignItem[],
  groups: Map<string, UnitSet[]>,
  live: boolean,
): Promise<string[]> {
  const warnings: string[] = [];
  const unitsIn = (column: string, set: string) =>
    (groups.get(column) ?? []).find((s) => s.name === set)?.unitIds ?? [];
  const special = (set: string) => [...new Set([...groups.keys()].flatMap((g) => unitsIn(g, set)))];
  const { questions } = collectQuestions(items);
  for (const { key, loop } of unitLoops(items)) {
    const title = loopTitle(loop, key);
    const units = loopUnits(loop);
    for (const [set, check, column] of [
      [PRACTICE_SET, units.practice === "ignore" ? undefined : units.practiceCheck, practiceColumn],
      [GOLD_SET, units.gold === "ignore" ? undefined : units.goldCheck, goldColumn],
    ] as const) {
      if (!check) continue;
      const specials = special(set);
      if (specials.length === 0) {
        warnings.push(
          `Loop '${title}': it checks ${set === GOLD_SET ? "gold" : "practice"} units, but no set column has ${set} units.`,
        );
        continue;
      }
      const rows = (await servedUnits(db, studyId, live, specials)).sort((a, b) => a.id - b.id);
      for (const question of check.questions ?? []) {
        const empty = rows.filter((r) => parseAnswerKey(r.data[column(question)]) === null);
        // Right answers that can never be right: not an option, not a number, a range without options in it
        const variable = questions.get(question) as Parameters<typeof answerKeyProblems>[1];
        const odd = rows.flatMap((r) => {
          const answer = parseAnswerKey(r.data[column(question)]);
          return answer ? answerKeyProblems(answer, variable).map((v) => `${r.externalId}: ${v}`) : [];
        });
        if (odd.length > 0) {
          warnings.push(
            `Loop '${title}': ${column(question)} has answers that don't fit '${question}' (${odd.slice(0, 5).join(", ")}${odd.length > 5 ? ", …" : ""}): those can never be right.`,
          );
        }
        if (empty.length === 0) continue;
        const which =
          empty
            .slice(0, 5)
            .map((r) => r.externalId)
            .join(", ") + (empty.length > 5 ? ", …" : "");
        warnings.push(
          `Loop '${title}': ${empty.length} ${set} unit${empty.length === 1 ? " has" : "s have"} no right answer for '${question}' in column ${column(question)} (${which})${set === GOLD_SET ? ": they aren't checked" : ": no feedback on them"}.`,
        );
      }
    }
  }
  return warnings;
}
