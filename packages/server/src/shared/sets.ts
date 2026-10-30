import {
  ALL_UNITS_UNITSET,
  OVERLAP_SET,
  SetGroupNameSchema,
  loopTitle,
  overlapGroup,
  setKey,
  unitLoops,
  type CodebookItem,
  type SetGroupResponse,
  type UnitSet,
} from "@annotinder/contracts";
import type { Sql } from "../db.js";
import { HttpError } from "./http.js";

// Set groups (docs/plans/sets-and-session-parameters.md §1): per unit its
// sets in each group (`unit_sets`), with an optional position. A set is in
// position order if its units have positions, else in the units' order.

interface Row {
  grp: string;
  set_name: string;
  unit_id: number;
  position: number | null;
}

/** The job's groups with their sets, in order (groups and sets by name). */
export async function listSetGroups(sql: Sql, jobId: number): Promise<SetGroupResponse[]> {
  const rows = await sql.query<Row>(
    "SELECT grp, set_name, unit_id, position FROM unit_sets WHERE job_id = $1 ORDER BY grp, set_name, position NULLS LAST, unit_id",
    [jobId],
  );
  const groups = new Map<string, Map<string, UnitSet>>();
  for (const r of rows) {
    if (!groups.has(r.grp)) groups.set(r.grp, new Map());
    const sets = groups.get(r.grp)!;
    if (!sets.has(r.set_name)) sets.set(r.set_name, { name: r.set_name, unitIds: [], ordered: false });
    const set = sets.get(r.set_name)!;
    set.unitIds.push(r.unit_id);
    if (r.position !== null) set.ordered = true;
  }
  return [...groups].map(([name, sets]) => ({ name, sets: [...sets.values()] }));
}

/** The sets of a group (names), without the reserved ones. */
export async function groupSets(sql: Sql, jobId: number, group: string): Promise<string[]> {
  const rows = await sql.query<{ set_name: string }>(
    "SELECT DISTINCT set_name FROM unit_sets WHERE job_id = $1 AND grp = $2 AND set_name NOT LIKE '\\_%' ORDER BY set_name",
    [jobId, group],
  );
  return rows.map((r) => r.set_name);
}

/** Makes or replaces a group: its sets' units, in order (positions for ordered sets). Units must be the job's. */
export async function putSetGroup(sql: Sql, jobId: number, group: string, sets: UnitSet[]): Promise<void> {
  if (!SetGroupNameSchema.safeParse(group).success) throw new HttpError(400, `'${group}' is not a group name: letters, digits and _, starting with a letter`);
  const names = sets.map((s) => s.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice !== undefined) throw new HttpError(400, `Set '${twice}' is given twice`);
  const ids = [...new Set(sets.flatMap((s) => s.unitIds))];
  if (ids.length > 0) {
    const own = new Set(
      (await sql.query<{ id: number }>("SELECT id FROM units WHERE job_id = $1 AND id = ANY($2)", [jobId, ids])).map((r) => r.id),
    );
    const foreign = ids.filter((id) => !own.has(id));
    if (foreign.length > 0) throw new HttpError(400, `Not units of this job: ${foreign.slice(0, 10).join(", ")}`);
  }
  await sql.query("DELETE FROM unit_sets WHERE job_id = $1 AND grp = $2", [jobId, group]);
  const rows = sets.flatMap((s) => [...new Set(s.unitIds)].map((unitId, i) => ({ set: s.name, unitId, position: s.ordered ? i + 1 : null })));
  if (rows.length === 0) return;
  await sql.query(
    `INSERT INTO unit_sets (job_id, grp, set_name, unit_id, position)
     SELECT $1, $2, * FROM unnest($3::text[], $4::int[], $5::int[])`,
    [jobId, group, rows.map((r) => r.set), rows.map((r) => r.unitId), rows.map((r) => r.position)],
  );
}

export async function deleteSetGroup(sql: Sql, jobId: number, group: string): Promise<boolean> {
  const deleted = await sql.query("DELETE FROM unit_sets WHERE job_id = $1 AND grp = $2 RETURNING unit_id", [jobId, group]);
  return deleted.length > 0;
}

/** The sets as the runtime reads them: keyed `group/set`, plus every unit of the job (`__all__`). */
export async function runtimeSets(sql: Sql, jobId: number): Promise<{ name: string; unitIds: number[] }[]> {
  const allUnitIds = (await sql.query<{ id: number }>("SELECT id FROM units WHERE job_id = $1 ORDER BY id", [jobId])).map((r) => r.id);
  const groups = await listSetGroups(sql, jobId);
  return [
    { name: ALL_UNITS_UNITSET, unitIds: allUnitIds },
    ...groups.flatMap((g) => g.sets.map((s) => ({ name: setKey(g.name, s.name), unitIds: s.unitIds }))),
  ];
}

/**
 * Warnings for a codebook about to be published, from the job's sets: a
 * loop takes an overlap its group doesn't have (or fewer units than it
 * expects), or assigns sets of a group without sets.
 */
export async function setWarnings(sql: Sql, jobId: number, items: CodebookItem[]): Promise<string[]> {
  const groups = new Map((await listSetGroups(sql, jobId)).map((g) => [g.name, g.sets]));
  const warnings: string[] = [];
  for (const { key, loop } of unitLoops(items)) {
    const title = loopTitle(loop, key);
    for (const branch of loop.units) {
      if (branch.mode === "assign" && !(groups.get(branch.group) ?? []).some((s) => !s.name.startsWith("_"))) {
        warnings.push(`Loop '${title}': group '${branch.group}' has no sets yet, so coders get no units until it has.`);
      }
      const group = overlapGroup(branch);
      if (group === null || branch.mode === "all" || !branch.overlap) continue;
      const n = (groups.get(group) ?? []).find((s) => s.name === OVERLAP_SET)?.unitIds.length ?? 0;
      if (n === 0) warnings.push(`Loop '${title}': the overlap is on, but group '${group}' has no ${OVERLAP_SET} units.`);
      else if (branch.overlap.expect !== undefined && n < branch.overlap.expect) {
        warnings.push(`Loop '${title}': group '${group}' has ${n} overlap units; ${branch.overlap.expect} are recommended.`);
      }
    }
  }
  return warnings;
}
