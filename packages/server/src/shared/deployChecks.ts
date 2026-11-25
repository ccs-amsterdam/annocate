import {
  CODER_SET,
  CONDITION_SET,
  PART_SET,
  TEST_SET,
  answerColumn,
  answerKeyProblems,
  coderInviteChecks,
  collectQuestions,
  forEachItem,
  inviteOf,
  loopTitle,
  loopUnits,
  parseAnswerKey,
  selectsUnits,
  sessionItem,
  unitLoops,
  type DesignItem,
  type SetGroupResponse,
  type TestSetType,
} from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { listSetGroups } from "./sets.js";
import { expertCoders } from "./studyCoders.js";
import { servedUnits, unitIds } from "./units.js";

// Checks of a design about to be deployed against the units' columns with a
// role (docs/plans/unit-sets.md). Errors keep the deploy from happening;
// warnings are shown with it.

/** What a check found. */
interface Checks {
  errors: string[];
  warnings: string[];
}

type Session = ReturnType<typeof sessionItem>;
type Invite = ReturnType<typeof inviteOf>;
type Experiment = Extract<DesignItem, { type: "experiment" }>;
/** A unit loop: its title and which units it shows. */
type Loop = { title: string; units: ReturnType<typeof loopUnits> };
/** A way units get to coders, and the units it reaches. */
type Selection = { label: string; units: Set<number> };

const quoted = (values: string[]) => values.map((v) => `'${v}'`).join(", ");

/** The units' columns with a role, to look up: a column's values, a value's units, every unit a column places. */
function columnsOf(groups: SetGroupResponse[]) {
  const sets = new Map(groups.map((g) => [g.name as string, g.sets]));
  return {
    valuesOf: (column: string) => (sets.get(column) ?? []).map((s) => s.name),
    unitsIn: (column: string, value: string) => (sets.get(column) ?? []).find((s) => s.name === value)?.unitIds ?? [],
    placed: (column: string) => new Set((sets.get(column) ?? []).flatMap((s) => s.unitIds)),
  };
}

/**
 * Checks of a design about to be deployed against the units' columns with a
 * role. Errors: expert coders without `coder_set`, or (signing in) coders
 * of it without an email address; an experiment that selects units
 * without `condition_set`, or with conditions it has no units for.
 * Warnings: coder ids that look like email addresses where coders pick
 * their name, conditions no experiment lists, parts no loop shows and loop
 * parts no unit has, units no coder gets, and test units a loop checks
 * without them or without right answers that fit.
 */
export async function assignmentChecks(db: Db, studyId: number, items: DesignItem[], live = false): Promise<Checks> {
  const columns = columnsOf(await listSetGroups(db, studyId, live));
  const session = sessionItem(items);
  const invite = inviteOf(session);
  const coders = columns.valuesOf(CODER_SET);
  const conditions = columns.valuesOf(CONDITION_SET);
  const parts = columns.valuesOf(PART_SET);
  const experiments = unitExperiments(items);
  const loops = unitLoops(items).map(({ loop }) => ({ title: loopTitle(loop), units: loopUnits(loop) }));

  const found = [
    coderChecks(invite, coders, await expertCoders(db, studyId)),
    experimentChecks(experiments, session, conditions),
    partChecks(loops, parts),
  ];
  const errors = found.flatMap((checks) => checks.errors);
  const warnings = found.flatMap((checks) => checks.warnings);

  // Units no coder gets: test units aside, those without a coder or condition, or a part a loop shows
  const selections: Selection[] = [];
  if (invite?.mode === "coders" && coders.length > 0)
    selections.push({ label: "coder", units: columns.placed(CODER_SET) });
  if (experiments.length > 0 && conditions.length > 0)
    selections.push({ label: "condition", units: columns.placed(CONDITION_SET) });
  if (everyLoopHasPart(loops) && parts.length > 0) {
    const shown = new Set(loops.flatMap((l) => columns.unitsIn(PART_SET, l.units.part!)));
    selections.push({ label: "part", units: shown });
  }
  if (selections.length > 0 && loops.length > 0) {
    const all = await unitIds(db, studyId, live);
    const warning = unassignedUnits(all, columns.placed(TEST_SET), selections);
    if (warning) warnings.push(warning);
  }

  warnings.push(...(await answerKeyWarnings(db, studyId, items, columns.unitsIn, columns.placed(PART_SET), live)));
  return { errors, warnings };
}

/**
 * Expert coders need a `coder_set` column; what the invitation asks of its
 * coders (contracts `coderInviteChecks`): an email address each where they
 * sign in, and a warning for ids like email addresses where they pick their name.
 */
function coderChecks(invite: Invite, coders: string[], experts: { coder: string; email: string | null }[]): Checks {
  if (invite?.mode === "coders" && coders.length === 0)
    return {
      errors: [`Expert coders: the units have no ${CODER_SET} column yet, which says who codes which units: make one.`],
      warnings: [],
    };
  const emails = new Map(experts.map((c) => [c.coder, c.email]));
  return coderInviteChecks(
    invite,
    coders.map((coder) => ({ coder, email: emails.get(coder) ?? null })),
  );
}

/** The experiments that select units (by `condition_set`). */
function unitExperiments(items: DesignItem[]): Experiment[] {
  const experiments: Experiment[] = [];
  forEachItem<DesignItem>(items, (it) => {
    if (selectsUnits(it) && it.type === "experiment") experiments.push(it);
    if (it.type !== "branch") return "skip";
  });
  return experiments;
}

/**
 * An experiment that selects units: its conditions (listed, from a URL
 * parameter, or `condition_set`'s) against the units' `condition_set`.
 */
function experimentChecks(experiments: Experiment[], session: Session, conditions: string[]): Checks {
  const errors: string[] = [];
  const warnings: string[] = [];
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
    if (missing.length > 0) errors.push(`${title}: ${CONDITION_SET} has no units for ${quoted(missing)}.`);
    const unlisted = conditions.filter((v) => !listed.includes(v));
    if (unlisted.length > 0)
      warnings.push(
        `${title} doesn't have the conditions ${quoted(unlisted)} of ${CONDITION_SET}: no coder gets those units.`,
      );
  }
  return { errors, warnings };
}

/** Every loop shows one part (a loop without a part shows them all). */
const everyLoopHasPart = (loops: Loop[]) => loops.length > 0 && loops.every((l) => l.units.part !== undefined);

/** Parts: every loop's part is in `part_set`, and every part is shown by a loop. */
function partChecks(loops: Loop[], parts: string[]): Checks {
  const warnings: string[] = [];
  for (const { title, units } of loops)
    if (units.part !== undefined && !parts.includes(units.part))
      warnings.push(
        parts.length === 0
          ? `Loop '${title}' shows part '${units.part}', but the units have no ${PART_SET} column yet: it gets no units.`
          : `Loop '${title}' shows part '${units.part}', but no unit has it in ${PART_SET}: it gets no units.`,
      );
  if (everyLoopHasPart(loops))
    for (const part of parts)
      if (!loops.some((l) => l.units.part === part)) warnings.push(`Part '${part}' isn't shown by any loop.`);
  return { errors: [], warnings };
}

/** The warning about units no coder gets: not a test unit, and outside one of the ways units are given out. Null if there are none. */
function unassignedUnits(all: number[], tests: ReadonlySet<number>, selections: Selection[]): string | null {
  const none = all.filter((id) => !tests.has(id) && selections.some((s) => !s.units.has(id))).length;
  if (none === 0) return null;
  const labels = selections.map((s) => s.label);
  const which = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}` : labels[0];
  return `${none} unit${none === 1 ? " is" : "s are"} in no ${which} set${selections.some((s) => s.label === "part") ? " a loop shows" : ""} and ${none === 1 ? "isn't a test unit" : "aren't test units"}: no coder gets ${none === 1 ? "it" : "them"}.`;
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
  for (const { loop } of unitLoops(items)) {
    const title = loopTitle(loop);
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
