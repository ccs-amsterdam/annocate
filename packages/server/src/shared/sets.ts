import {
  ALL_UNITS_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  GOLD_SET,
  branchGroup,
  collectQuestions,
  goldColumn,
  parseAnswerKey,
  answerKeyProblems,
  practiceColumn,
  SetGroupNameSchema,
  loopTitle,
  overlapGroup,
  setKey,
  unitLoops,
  type DesignItem,
  type SetGroupResponse,
  type UnitSet,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { HttpError } from "./http.js";
import { lockUnits, servedUnits } from "./units.js";

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

/** The job's groups with their sets, in order (groups and sets by name): the draft's, or the deployed ones (`live`). */
export async function listSetGroups(sql: Sql, jobId: number, live = false): Promise<SetGroupResponse[]> {
  // Empty sets too (a set without units yet still names a link, a set to assign)
  const rows = await sql.query<Omit<Row, "unit_id"> & { unit_id: number | null }>(
    `SELECT s.grp, s.name, m.unit_id, m.position FROM unit_sets s LEFT JOIN unit_set_members m ON m.set_id = s.id
     WHERE s.job_id = $1 AND s.live = $2 ORDER BY s.grp, s.name, m.position NULLS LAST, m.unit_id`,
    [jobId, live],
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
export async function groupSets(sql: Sql, jobId: number, group: string, live = false): Promise<string[]> {
  const rows = await sql.query<{ name: string }>(
    "SELECT name FROM unit_sets WHERE job_id = $1 AND live = $2 AND grp = $3 AND name NOT LIKE '\\_%' ORDER BY name",
    [jobId, live, group],
  );
  return rows.map((r) => r.name);
}

/** Makes or replaces a group of the draft: its sets' units, in order (positions for ordered sets). Units must be the draft's. */
export async function putSetGroup(sql: Sql, jobId: number, group: string, sets: UnitSet[]): Promise<void> {
  await lockUnits(sql, jobId, "write");
  if (!SetGroupNameSchema.safeParse(group).success) throw new HttpError(400, `'${group}' is not a group name: letters, digits and _, starting with a letter`);
  const names = sets.map((s) => s.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice !== undefined) throw new HttpError(400, `Set '${twice}' is given twice`);
  const ids = [...new Set(sets.flatMap((s) => s.unitIds))];
  if (ids.length > 0) {
    const own = new Set(
      (await sql.query<{ id: number }>("SELECT id FROM units WHERE job_id = $1 AND id = ANY($2) AND in_draft", [jobId, ids])).map((r) => r.id),
    );
    const foreign = ids.filter((id) => !own.has(id));
    if (foreign.length > 0) throw new HttpError(400, `Not units of this job: ${foreign.slice(0, 10).join(", ")}`);
  }
  await sql.query("DELETE FROM unit_sets WHERE job_id = $1 AND NOT live AND grp = $2", [jobId, group]);
  for (const set of sets) {
    const created = await one<{ id: number }>(sql, "INSERT INTO unit_sets (job_id, live, grp, name) VALUES ($1, false, $2, $3) RETURNING id", [
      jobId,
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

export async function deleteSetGroup(sql: Sql, jobId: number, group: string): Promise<boolean> {
  await lockUnits(sql, jobId, "write");
  const deleted = await sql.query("DELETE FROM unit_sets WHERE job_id = $1 AND NOT live AND grp = $2 RETURNING id", [jobId, group]);
  return deleted.length > 0;
}

/**
 * The sets as the runtime reads them, keyed `group/set`, plus all its units
 * (`__all__`): deployed (`live`), or the draft's (previews).
 */
export async function runtimeSets(sql: Sql, jobId: number, live: boolean): Promise<{ name: string; unitIds: number[] }[]> {
  const allUnitIds = (
    live
      ? await sql.query<{ id: number }>("SELECT DISTINCT unit_id AS id FROM unit_versions WHERE job_id = $1 AND to_deploy IS NULL ORDER BY unit_id", [jobId])
      : await sql.query<{ id: number }>("SELECT id FROM units WHERE job_id = $1 AND in_draft ORDER BY id", [jobId])
  ).map((r) => r.id);
  const groups = await listSetGroups(sql, jobId, live);
  return [
    { name: ALL_UNITS_SET, unitIds: allUnitIds },
    ...groups.flatMap((g) => g.sets.map((s) => ({ name: setKey(g.name, s.name), unitIds: s.unitIds }))),
  ];
}

/**
 * Warnings for a codebook about to be deployed, from the job's sets: a
 * loop takes an overlap its group doesn't have (or fewer units than it
 * expects), or assigns sets of a group without sets.
 */
export async function setWarnings(sql: Sql, jobId: number, items: DesignItem[], live = false): Promise<string[]> {
  const groups = new Map((await listSetGroups(sql, jobId, live)).map((g) => [g.name, g.sets]));
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
          const rows = (await servedUnits(sql, jobId, live, units)).sort((a, b) => a.id - b.id);
          for (const question of settings.questions ?? []) {
            const empty = rows.filter((r) => parseAnswerKey(r.data[column(question)]) === null);
            // Right answers that can never be right: not an option, not a number, a range without options in it
            const variable = questions.get(question) as Parameters<typeof answerKeyProblems>[1];
            const odd = rows.flatMap((r) => {
              const key = parseAnswerKey(r.data[column(question)]);
              return key ? answerKeyProblems(key, variable).map((v) => `${r.external_id}: ${v}`) : [];
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
