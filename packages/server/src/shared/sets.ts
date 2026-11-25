import {
  ALL_UNITS_SET,
  RoleColumnSchema,
  designSetColumns,
  roleColumnProblem,
  roleColumnType,
  setKey,
  type SetGroupResponse,
  type UnitSet,
} from "@annotinder/contracts";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { anyOf } from "../db/sql.js";
import type { Db } from "../db/index.js";
import { deployments, designVersions, unitSetMembers, unitSets, units } from "../db/schema/index.js";
import { designVersionItems } from "./designVersions.js";
import { HttpError } from "./http.js";
import { firstDuplicate } from "./lists.js";
import { getUnitFields, lockUnits, setUnitFields, unitIds } from "./units.js";

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
  const twice = firstDuplicate(sets.map((s) => s.name));
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
      SELECT ${created!.id}, * FROM unnest(${sql.param(members)}::bigint[], ${sql.param(positions)}::int[])`);
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

/** Whether the deployed or latest design selects units by a column (`designSetColumns`). */
export async function groupInUse(db: Db, studyId: number, group: string): Promise<boolean> {
  const deployed = db
    .select({ id: deployments.designVersionId })
    .from(deployments)
    .where(eq(deployments.studyId, studyId));
  const latest = db
    .select({ id: sql`max(${designVersions.id})` })
    .from(designVersions)
    .where(eq(designVersions.studyId, studyId));
  const rows = await db
    .select({ items: designVersions.items, session: designVersions.session })
    .from(designVersions)
    .where(
      and(eq(designVersions.studyId, studyId), or(eq(designVersions.id, deployed), eq(designVersions.id, latest))),
    );
  return rows.some((row) => (designSetColumns(designVersionItems(row)) as string[]).includes(group));
}
