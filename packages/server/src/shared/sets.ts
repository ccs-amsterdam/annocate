import {
  ALL_UNITS_UNITSET,
  OVERLAP_SET,
  PRACTICE_SET,
  GOLD_SET,
  branchGroup,
  collectQuestions,
  goldColumn,
  parseAnswerKey,
  unknownAnswerValues,
  practiceColumn,
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
import { snapshotUnits } from "./units.js";

// Set groups (docs/plans/sets-and-session-parameters.md §1): per unit its
// sets in each group (`unit_sets`), with an optional position. A set is in
// position order if its units have positions, else in the units' order.

interface Row {
  grp: string;
  set_name: string;
  unit_id: number;
  position: number | null;
}

/**
 * The job's groups with their sets, in order (groups and sets by name): of
 * a deployed snapshot, or (null) the draft's (docs/plans/design.md §5).
 */
export async function listSetGroups(sql: Sql, jobId: number, snapshotId: number | null = null): Promise<SetGroupResponse[]> {
  const rows =
    snapshotId === null
      ? await sql.query<Row>(
          "SELECT grp, set_name, unit_id, position FROM unit_sets WHERE job_id = $1 ORDER BY grp, set_name, position NULLS LAST, unit_id",
          [jobId],
        )
      : await sql.query<Row>(
          "SELECT grp, set_name, unit_id, position FROM snapshot_sets WHERE snapshot_id = $1 ORDER BY grp, set_name, position NULLS LAST, unit_id",
          [snapshotId],
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
export async function groupSets(sql: Sql, jobId: number, group: string, snapshotId: number | null = null): Promise<string[]> {
  const sets = (await listSetGroups(sql, jobId, snapshotId)).find((g) => g.name === group)?.sets ?? [];
  return sets.map((s) => s.name).filter((name) => !name.startsWith("_"));
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
      (await sql.query<{ id: number }>("SELECT id FROM units WHERE job_id = $1 AND id = ANY($2) AND version_id IS NOT NULL", [jobId, ids])).map((r) => r.id),
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
export async function runtimeSets(sql: Sql, jobId: number, snapshotId: number | null): Promise<{ name: string; unitIds: number[] }[]> {
  const allUnitIds = (
    snapshotId === null
      ? await sql.query<{ id: number }>("SELECT id FROM units WHERE job_id = $1 AND version_id IS NOT NULL ORDER BY id", [jobId])
      : await sql.query<{ id: number }>("SELECT unit_id AS id FROM snapshot_units WHERE snapshot_id = $1 ORDER BY unit_id", [snapshotId])
  ).map((r) => r.id);
  const groups = await listSetGroups(sql, jobId, snapshotId);
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
export async function setWarnings(sql: Sql, jobId: number, items: CodebookItem[], snapshotId: number | null = null): Promise<string[]> {
  const groups = new Map((await listSetGroups(sql, jobId, snapshotId)).map((g) => [g.name, g.sets]));
  const warnings: string[] = [];
  const { questions } = collectQuestions(items);
  for (const { key, loop } of unitLoops(items)) {
    const title = loopTitle(loop, key);
    for (const branch of loop.units) {
      if (branch.mode === "assign" && !(groups.get(branch.group) ?? []).some((s) => !s.name.startsWith("_"))) {
        warnings.push(`Loop '${title}': group '${branch.group}' has no sets yet, so coders get no units until it has.`);
      }
      // Practice and gold: units, and right answers in their columns
      const special = branchGroup(branch);
      if (special !== null && branch.mode !== "all") {
        for (const [set, settings, column] of [
          [PRACTICE_SET, branch.practice, practiceColumn],
          [GOLD_SET, branch.gold, goldColumn],
        ] as const) {
          if (!settings) continue;
          const units = (groups.get(special) ?? []).find((s) => s.name === set)?.unitIds ?? [];
          if (units.length === 0) {
            warnings.push(`Loop '${title}': ${set === GOLD_SET ? "gold" : "practice"} units are on, but group '${special}' has no ${set} units.`);
            continue;
          }
          const rows = (await snapshotUnits(sql, jobId, snapshotId, units)).sort((a, b) => a.id - b.id);
          for (const question of settings.questions ?? []) {
            const empty = rows.filter((r) => parseAnswerKey(r.data[column(question)]) === null);
            // Right answers that aren't options of the question
            const variable = questions.get(question);
            const options = variable && "options" in variable ? (variable.options as { value: unknown }[]).map((o) => String(o.value)) : undefined;
            const odd = rows.flatMap((r) => {
              const key = parseAnswerKey(r.data[column(question)]);
              return key ? unknownAnswerValues(key, options).map((v) => `${r.external_id}: ${v}`) : [];
            });
            if (odd.length > 0) {
              warnings.push(
                `Loop '${title}': ${column(question)} has values that aren't options of '${question}' (${odd.slice(0, 5).join(", ")}${odd.length > 5 ? ", …" : ""}): those answers can never be right.`,
              );
            }
            if (empty.length === 0) continue;
            const which = empty.slice(0, 5).map((r) => r.external_id).join(", ") + (empty.length > 5 ? ", …" : "");
            warnings.push(
              `Loop '${title}': ${empty.length} ${set} unit${empty.length === 1 ? " has" : "s have"} no right answer for '${question}' in column ${column(question)} (${which})${set === GOLD_SET ? ": they aren't checked" : ": no feedback on them"}.`,
            );
          }
        }
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
