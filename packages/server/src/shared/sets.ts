import {
  ALL_UNITS_SET,
  CODER_SET,
  CONDITION_SET,
  PART_SET,
  TEST_SET,
  coderAccess,
  inviteOf,
  sessionItem,
  collectQuestions,
  answerColumn,
  parseAnswerKey,
  answerKeyProblems,
  RoleColumnSchema,
  roleColumnProblem,
  roleColumnType,
  loopTitle,
  setKey,
  selectsUnits,
  unitLoops,
  loopUnits,
  forEachItem,
  type DesignItem,
  type SetGroupResponse,
  type TestSetType,
  type UnitSet,
} from "@annotinder/contracts";
import { and, asc, eq, sql } from "drizzle-orm";
import { anyOf } from "../db/sql.js";
import type { Db } from "../db/index.js";
import { unitSetMembers, unitSets, units } from "../db/schema/index.js";
import { HttpError } from "./http.js";
import { getUnitFields, lockUnits, servedUnits, setUnitFields, unitIds } from "./units.js";

// The columns with a role (docs/plans/unit-sets.md: `coder_set`,
// `condition_set`, `part_set`, `test_set`), stored as sets
// (`unit_sets`: column (`grp`), value (`name`)) and their units
// (`unit_set_members`), with an optional position. A set is in position
// order if its units have positions, else in the units' order. Two copies
// (docs/architecture.md §8.4): the draft's, and the deployed (`live`) ones a
// deploy copies from it.

/** A column of the draft. */
const draftGroup = (studyId: number, group: string) =>
  and(eq(unitSets.studyId, studyId), eq(unitSets.live, false), eq(unitSets.grp, group));

/** The study's columns with their sets, in order (columns and sets by name): the draft's, or the deployed ones (`live`). */
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
  return [...groups].map(([name, sets]) => ({ name: name as SetGroupResponse["name"], sets: [...sets.values()] }));
}

/** The values (sets) of a column: the draft's, or the deployed ones (`live`). */
export async function groupSets(db: Db, studyId: number, group: string, live = false): Promise<string[]> {
  const rows = await db
    .select({ name: unitSets.name })
    .from(unitSets)
    .where(and(eq(unitSets.studyId, studyId), eq(unitSets.live, live), eq(unitSets.grp, group)))
    .orderBy(asc(unitSets.name));
  return rows.map((r) => r.name);
}

/**
 * Makes or replaces a column with a role of the draft: its sets' units, in
 * order (positions for ordered sets). Units must be the draft's;
 * `test_set` takes only the test sets, one per unit. The column is a
 * unit field of its type in the draft design (`declare`, the default).
 */
export async function putSetGroup(
  db: Db,
  studyId: number,
  group: string,
  sets: UnitSet[],
  options: { declare?: boolean } = {},
): Promise<void> {
  await lockUnits(db, studyId, "write");
  const column = RoleColumnSchema.safeParse(group);
  if (!column.success)
    throw new HttpError(400, `'${group}' is not a column with a role (coder_set, condition_set, part_set, test_set)`);
  const problem = roleColumnProblem(column.data, sets);
  if (problem) throw new HttpError(400, `${group}: ${problem}`);
  if (options.declare !== false) {
    const fields = await getUnitFields(db, studyId);
    const type = roleColumnType(group);
    const field = fields.find((f) => f.name === group);
    if (field && field.type !== type)
      throw new HttpError(409, `'${group}' is a ${field.type} field of the units: delete it first`);
    if (!field) await setUnitFields(db, studyId, [...fields, { name: group, type }]);
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

/** Deletes a column with a role of the draft, and its field. */
export async function deleteSetGroup(db: Db, studyId: number, group: string): Promise<boolean> {
  await lockUnits(db, studyId, "write");
  const deleted = await db.delete(unitSets).where(draftGroup(studyId, group)).returning({ id: unitSets.id });
  const fields = await getUnitFields(db, studyId);
  const declared = fields.some((f) => f.name === group && f.type === roleColumnType(group));
  if (declared)
    await setUnitFields(
      db,
      studyId,
      fields.filter((f) => f.name !== group),
    );
  return deleted.length > 0 || declared;
}

/**
 * The sets as the runtime reads them, keyed `column/set`, plus all its units
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
 * Checks of a design about to be deployed against the units' columns with a
 * role (docs/plans/unit-sets.md). Errors: specific coders without
 * `coder_set`, or (signing in) with values that aren't all email addresses;
 * an experiment that selects units without `condition_set`, or with
 * conditions it has no units for. Warnings: conditions no experiment lists,
 * parts no loop shows and loop parts no unit has, units no coder gets, and
 * test units a loop checks without them or without right answers that fit.
 */
export async function assignmentChecks(
  db: Db,
  studyId: number,
  items: DesignItem[],
  live = false,
): Promise<{ errors: string[]; warnings: string[] }> {
  const groups = new Map((await listSetGroups(db, studyId, live)).map((g) => [g.name as string, g.sets]));
  const valuesOf = (column: string) => (groups.get(column) ?? []).map((s) => s.name);
  const unitsIn = (column: string, value: string) =>
    (groups.get(column) ?? []).find((s) => s.name === value)?.unitIds ?? [];
  const placed = (column: string) => new Set((groups.get(column) ?? []).flatMap((s) => s.unitIds));
  const errors: string[] = [];
  const warnings: string[] = [];
  const list = (values: string[]) => values.map((v) => `'${v}'`).join(", ");

  const session = sessionItem(items);
  const invite = inviteOf(session);
  const coders = valuesOf(CODER_SET);
  if (invite.mode === "coders") {
    if (coders.length === 0)
      errors.push(
        `Specific coders: the units have no ${CODER_SET} column yet, which says who codes which units: make one.`,
      );
    else if (invite.link === "login" && coderAccess(coders) !== "email")
      errors.push(
        `Coders sign in with their email address, but the coders (${CODER_SET}) aren't all email addresses: make them email addresses, or give each coder a link.`,
      );
  }

  // The experiment that selects units: its conditions (listed, from a URL parameter, or condition_set's)
  const conditions = valuesOf(CONDITION_SET);
  const experiments: { name: string; variable: Extract<DesignItem, { type: "experiment" }>["variable"] }[] = [];
  forEachItem<DesignItem>(items, (it) => {
    if (selectsUnits(it) && it.type === "experiment") experiments.push(it);
    if (it.type !== "block") return "skip";
  });
  for (const { name, variable } of experiments) {
    const title = `Experiment '${name}'`;
    if (conditions.length === 0) {
      errors.push(
        `${title} selects units by ${CONDITION_SET}, but the units have no ${CONDITION_SET} column yet: make one.`,
      );
      continue;
    }
    const param =
      variable.draw === "url_param" ? session?.urlParams?.find((p) => p.name === variable.param) : undefined;
    const listed = variable.options?.map((o) => o.value) ?? param?.values?.map((v) => v.value) ?? null;
    if (listed === null) continue;
    const missing = listed.filter((v) => !conditions.includes(v));
    if (missing.length > 0) errors.push(`${title}: ${CONDITION_SET} has no units for ${list(missing)}.`);
    const unlisted = conditions.filter((v) => !listed.includes(v));
    if (unlisted.length > 0)
      warnings.push(
        `${title} doesn't have the conditions ${list(unlisted)} of ${CONDITION_SET}: no coder gets those units.`,
      );
  }

  // Parts: every loop's part in part_set; a part no loop shows (a loop without a part shows them all)
  const loops = unitLoops(items).map(({ key, loop }) => ({ title: loopTitle(loop, key), units: loopUnits(loop) }));
  const parts = valuesOf(PART_SET);
  for (const { title, units } of loops)
    if (units.part !== undefined && !parts.includes(units.part))
      warnings.push(
        parts.length === 0
          ? `Loop '${title}' shows part '${units.part}', but the units have no ${PART_SET} column yet: it gets no units.`
          : `Loop '${title}' shows part '${units.part}', but no unit has it in ${PART_SET}: it gets no units.`,
      );
  const everyLoopAPart = loops.length > 0 && loops.every((l) => l.units.part !== undefined);
  if (everyLoopAPart)
    for (const part of parts)
      if (!loops.some((l) => l.units.part === part)) warnings.push(`Part '${part}' isn't shown by any loop.`);

  // Units no coder gets: test units aside, those without a coder or condition, or a part a loop shows
  const tests = placed(TEST_SET);
  const selections: { label: string; units: Set<number> }[] = [];
  if (invite.mode === "coders" && coders.length > 0) selections.push({ label: "coder", units: placed(CODER_SET) });
  if (experiments.length > 0 && conditions.length > 0)
    selections.push({ label: "condition", units: placed(CONDITION_SET) });
  if (everyLoopAPart && parts.length > 0)
    selections.push({ label: "part", units: new Set(loops.flatMap((l) => unitsIn(PART_SET, l.units.part!))) });
  if (selections.length > 0 && loops.length > 0) {
    const all = await unitIds(db, studyId, live);
    const none = all.filter((id) => !tests.has(id) && selections.some((s) => !s.units.has(id))).length;
    const labels = selections.map((s) => s.label);
    const which = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}` : labels[0];
    if (none > 0)
      warnings.push(
        `${none} unit${none === 1 ? " is" : "s are"} in no ${which} set${selections.some((s) => s.label === "part") ? " a loop shows" : ""} and ${none === 1 ? "isn't a test unit" : "aren't test units"}: no coder gets ${none === 1 ? "it" : "them"}.`,
      );
  }

  warnings.push(...(await answerKeyWarnings(db, studyId, items, unitsIn, placed(PART_SET), live)));
  return { errors, warnings };
}

/**
 * Warnings about the checks on practice and gold units the loops configure:
 * no such test units (in the loop's part), or right answers missing or not
 * fitting their question.
 */
async function answerKeyWarnings(
  db: Db,
  studyId: number,
  items: DesignItem[],
  unitsIn: (column: string, value: string) => number[],
  withPart: ReadonlySet<number>,
  live: boolean,
): Promise<string[]> {
  const warnings: string[] = [];
  const { questions } = collectQuestions(items);
  for (const { key, loop } of unitLoops(items)) {
    const title = loopTitle(loop, key);
    const units = loopUnits(loop);
    // A test unit with a part is only in that part's loops
    const part = new Set(units.part === undefined ? [] : unitsIn(PART_SET, units.part));
    const inLoop = (ids: number[]) =>
      units.part === undefined ? ids : ids.filter((id) => part.has(id) || !withPart.has(id));
    for (const [type, check] of [
      ["practice", units.practice === "ignore" ? undefined : units.practiceCheck],
      ["gold", units.gold === "ignore" ? undefined : units.goldCheck],
    ] as [TestSetType, { questions?: string[] } | undefined][]) {
      if (!check) continue;
      const ids = inLoop(unitsIn(TEST_SET, type));
      if (ids.length === 0) {
        warnings.push(`Loop '${title}': it checks ${type} units, but it has none (${TEST_SET} '${type}').`);
        continue;
      }
      const rows = (await servedUnits(db, studyId, live, ids)).sort((a, b) => a.id - b.id);
      for (const question of check.questions ?? []) {
        const column = answerColumn(question);
        const empty = rows.filter((r) => parseAnswerKey(r.data[column]) === null);
        // Right answers that can never be right: not an option, not a number, a range without options in it
        const variable = questions.get(question) as Parameters<typeof answerKeyProblems>[1];
        const odd = rows.flatMap((r) => {
          const answer = parseAnswerKey(r.data[column]);
          return answer ? answerKeyProblems(answer, variable).map((v) => `${r.externalId}: ${v}`) : [];
        });
        if (odd.length > 0) {
          warnings.push(
            `Loop '${title}': ${column} has answers that don't fit '${question}' (${odd.slice(0, 5).join(", ")}${odd.length > 5 ? ", …" : ""}): those can never be right.`,
          );
        }
        if (empty.length === 0) continue;
        const which =
          empty
            .slice(0, 5)
            .map((r) => r.externalId)
            .join(", ") + (empty.length > 5 ? ", …" : "");
        warnings.push(
          `Loop '${title}': ${empty.length} ${type} unit${empty.length === 1 ? " has" : "s have"} no right answer for '${question}' in column ${column} (${which})${type === "gold" ? ": they aren't checked" : ": no feedback on them"}.`,
        );
      }
    }
  }
  return warnings;
}
