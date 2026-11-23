import {
  CODER_SET,
  CONDITION_SET,
  CriteriaSchema,
  TEST_SET,
  TEST_SET_TYPES,
  seededShuffle,
  type TestSetType,
  type Criteria,
  type RecipeInput,
  type SessionSpec,
  type UnitCreate,
  type UnitField,
  type UnitData,
} from "@annotinder/contracts";
import { placedFields, simpleTemplate, type SimpleLayout } from "../design/simpleLayout";

// The setup wizard (docs/client.md §7, "Guided setup") as data: what the
// researcher chose, and the recipe it makes. The wizard asks no question
// details: questions are made by name, with no answer type yet, to specify
// in the editor.

/** Which parts the study has. An experiment alone is a survey with an experiment. */
export interface SetupParts {
  annotate: boolean;
  survey: boolean;
  experiment: boolean;
}

interface SetupExperiment {
  /** The condition's name (an experiment, drawn at random). */
  name: string;
  /** The conditions' values. */
  conditions: string[];
  /** `random`: a random draw per coder; `balanced`: the condition with the fewest coders so far. */
  assign: "random" | "balanced";
}

/** Overlap units (`test_set` overlap): this many units every coder codes besides their own, for checking agreement. */
export type SetupOverlap = number | null;

/** Who codes what (annotation), each with its own settings. */
export type SetupDistribution =
  /** Every coder codes every unit. */
  | { mode: "all" }
  /**
   * The units in sets, each a coder's (`coder_set`, a link each): `split`
   * into `sets` sets (`coder_1` ...), or one set per value of `column`
   * (values `overlap`, `practice` and `gold` make test units).
   */
  | {
      mode: "sets";
      source: "split" | "column";
      sets: number;
      column: string;
      overlap: SetupOverlap;
    }
  /**
   * Crowd coding: a shared queue, with the criteria the editor's form has
   * (`shared`: coders per unit or agreement, units per coder, priority),
   * and optionally overlap units.
   */
  | { mode: "crowd"; shared: Criteria; overlap: SetupOverlap }
  /** A set per experimental condition (`condition_set`): the units whose `column` has one of the condition's values. */
  | { mode: "groups"; column: string; values: Record<string, string[]> };

export const DISTRIBUTIONS: { mode: SetupDistribution["mode"]; label: string; help: string }[] = [
  { mode: "all", label: "Everyone codes everything", help: "Every coder codes every unit." },
  {
    mode: "sets",
    label: "Assign sets",
    help: "The units are divided over coders (or by a column), each coder with their own link, optionally plus overlap units everyone codes. The classic design with a few expert coders.",
  },
  {
    mode: "crowd",
    label: "Crowd coding",
    help: "A shared queue: each unit goes to coders until enough coded it, or enough agree, and then to no one else.",
  },
  {
    mode: "groups",
    label: "Experimental groups",
    help: "Each condition of the experiment gets its own units, chosen by the values of a column.",
  },
];

/** The settings an option starts with. */
export function defaultDistribution(mode: SetupDistribution["mode"], columns: string[] = []): SetupDistribution {
  switch (mode) {
    case "all":
      return { mode };
    case "sets":
      return { mode, source: "split", sets: 2, column: columns[0] ?? "", overlap: null };
    case "crowd":
      return { mode, shared: { codersPerUnit: { min: 1, max: 1 } }, overlap: null };
    case "groups":
      return { mode, column: columns[0] ?? "", values: {} };
  }
}

export interface SetupUnits {
  fields: UnitField[];
  units: UnitCreate[];
}

export interface SetupAnswers {
  name: string;
  /** The title coders see (the design's `public.title`); empty: none. */
  publicTitle: string;
  parts: SetupParts;
  experiment: SetupExperiment;
  /** Annotation: the units (null: uploaded later), how a unit is shown, and who codes what. */
  units: SetupUnits | null;
  layout: SimpleLayout;
  distribution: SetupDistribution;
  order: "sequential" | "random";
  /** Question lines, as typed: before the units (or the survey's), per unit, after the units. */
  questions: { before: string[]; unit: string[]; after: string[] };
  /**
   * Per-unit questions checked on units with a known answer
   * (docs/architecture.md §6.2): `gold` silently, `practice` with
   * feedback. Only with sets (assign sets, crowd coding).
   */
  checks: { gold: string[]; practice: string[] };
}

export const DEFAULT_SETUP: SetupAnswers = {
  name: "",
  publicTitle: "",
  parts: { annotate: true, survey: false, experiment: false },
  experiment: { name: "condition", conditions: ["control", "treatment"], assign: "balanced" },
  units: null,
  layout: { body: [] },
  distribution: { mode: "all" },
  order: "sequential",
  questions: { before: [], unit: [], after: [] },
  checks: { gold: [], practice: [] },
};

/** Where questions go: a survey (or experiment) alone has one list; annotation with a survey has three. */
export function questionLists(parts: SetupParts): ("before" | "unit" | "after")[] {
  if (!parts.annotate) return ["before"];
  return parts.survey ? ["before", "unit", "after"] : ["unit"];
}

/** A question's name from what was typed: `How old are you?` -> `how_old_are_you`. */
function questionName(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .replace(/_+$/, "");
}

export interface SetupQuestion {
  name: string;
  /** The typed text, as the question, when it is more than the name. */
  question?: string;
}

/** The questions of one list: blank lines left out. */
export function parseQuestions(lines: string[]): SetupQuestion[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const name = questionName(line);
      return line === name ? { name } : { name, question: line };
    });
}

/** A set's name from a column's value: no `;` or `#`. */
const setName = (value: string) => value.trim().replace(/[;#]+/g, "_").slice(0, 128) || "empty";

const isTestSetType = (value: string): value is TestSetType =>
  (TEST_SET_TYPES as readonly string[]).includes(value.trim());

/** Whether a distribution has coders or a crowd's queue: then gold and practice units can be mixed in. */
export const hasSetGroup = (d: SetupDistribution) => d.mode === "sets" || d.mode === "crowd";

/** A loop's units settings with the gold and practice checks the wizard asked for, on questions that are per-unit questions. */
function withChecks(units: object, checks: SetupAnswers["checks"], unitQuestions: string[]): object {
  const gold = checks.gold.filter((q) => unitQuestions.includes(q));
  const practice = checks.practice.filter((q) => unitQuestions.includes(q));
  return {
    ...units,
    // Practice first; gold spread through the coder's units (the default)
    ...(practice.length > 0 ? { practice: "before", practiceCheck: { questions: practice } } : {}),
    ...(gold.length > 0 ? { goldCheck: { questions: gold } } : {}),
  };
}

/** A unit's value in a column, as text. */
const valueOf = (unit: UnitCreate, column: string) => String((unit.data as UnitData)[column] ?? "");

/** The distinct values of a column, in the units' order. */
export function columnValues(units: SetupUnits | null, column: string): string[] {
  return [...new Set((units?.units ?? []).map((u) => valueOf(u, column)))];
}

/** How many units an overlap takes of `n`. */
export function overlapCount(overlap: SetupOverlap, n: number): number {
  return overlap ? Math.min(n, Math.max(0, Math.round(overlap))) : 0;
}

/**
 * The coders' sets a distribution makes (`coder_set`), and its test units
 * (`test_set`): the overlap drawn at random (fixed seed) and taken out of
 * the sets, and with sets by a column, its values `overlap`, `practice` and
 * `gold`.
 */
export function distributionSets(
  d: SetupDistribution,
  units: SetupUnits | null,
): { sets: { name: string; units: string[] }[]; overlap: string[]; tests: { name: TestSetType; units: string[] }[] } {
  const all = units?.units ?? [];
  // A column's test units (its values overlap, practice, gold) aren't drawn for the overlap, nor anyone's
  const marked = new Map<string, TestSetType>(
    d.mode === "sets" && d.source === "column"
      ? all.flatMap((u) => {
          const value = valueOf(u, d.column).trim();
          return isTestSetType(value) ? [[u.externalId, value] as [string, TestSetType]] : [];
        })
      : [],
  );
  const drawable = all.map((u) => u.externalId).filter((id) => !marked.has(id));
  const overlapIds = "overlap" in d ? seededShuffle(drawable, 1).slice(0, overlapCount(d.overlap, all.length)) : [];
  const inOverlap = new Set(overlapIds);
  const rest = all.filter((u) => !inOverlap.has(u.externalId) && !marked.has(u.externalId));
  const tests = TEST_SET_TYPES.map((name) => ({
    name,
    units: [
      ...(name === "overlap" ? overlapIds : []),
      ...[...marked].filter(([, type]) => type === name).map(([id]) => id),
    ],
  })).filter((t) => t.units.length > 0);
  const overlap = tests.find((t) => t.name === "overlap")?.units ?? [];
  if (d.mode === "sets") {
    if (d.source === "column") {
      // By set name: values that make the same name (e.g. "a;b" and "a#b") are one set
      const byName = new Map<string, string[]>();
      for (const u of rest) {
        const name = setName(valueOf(u, d.column));
        byName.set(name, [...(byName.get(name) ?? []), u.externalId]);
      }
      return { sets: [...byName].map(([name, units]) => ({ name, units })), overlap, tests };
    }
    const n = Math.max(1, d.sets);
    const shuffled = seededShuffle(
      rest.map((u) => u.externalId),
      2,
    );
    const sets = Array.from({ length: n }, (_, i) => ({
      name: `coder_${i + 1}`,
      units: shuffled.filter((_, j) => j % n === i),
    }));
    return { sets, overlap, tests };
  }
  if (d.mode === "crowd") return { sets: [], overlap, tests };
  return { sets: [], overlap: [], tests: [] };
}

/** What stops the wizard at a step; empty: fine. */
export function setupProblems(answers: SetupAnswers): string[] {
  const problems: string[] = [];
  if (!answers.name.trim()) problems.push("Give the study a name");
  if (!answers.parts.annotate && !answers.parts.survey && !answers.parts.experiment)
    problems.push("Choose at least one of annotate, survey or experiment");
  const lists = questionLists(answers.parts);
  const names = new Map<string, number>();
  const add = (name: string) => names.set(name, (names.get(name) ?? 0) + 1);
  if (answers.parts.experiment) {
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(answers.experiment.name))
      problems.push("The condition's name: letters, digits and _ only");
    add(answers.experiment.name);
    const conditions = answers.experiment.conditions.map((c) => c.trim()).filter(Boolean);
    if (conditions.length < 2) problems.push("An experiment needs at least two conditions");
    if (new Set(conditions).size !== conditions.length) problems.push("Each condition once");
  }
  for (const list of lists) {
    for (const q of parseQuestions(answers.questions[list])) {
      if (!q.name)
        problems.push(
          `"${answers.questions[list].find((l) => questionName(l) === q.name) ?? ""}" makes no name: use letters or digits`,
        );
      else add(q.name);
    }
  }
  const twice = [...names].filter(([, n]) => n > 1).map(([name]) => name);
  if (twice.length > 0) problems.push(`Each question once: ${twice.join(", ")}`);
  if (answers.parts.annotate && parseQuestions(answers.questions.unit).length === 0)
    problems.push("Add at least one question about each unit");
  if (!answers.parts.annotate && parseQuestions(answers.questions.before).length === 0)
    problems.push("Add at least one question");
  if (answers.parts.annotate) problems.push(...distributionProblems(answers));
  // With units: something of each unit is shown
  if (answers.parts.annotate && answers.units && placedFields(answers.layout).length === 0)
    problems.push("Choose what coders see of each unit (How coders see a unit)");
  return problems;
}

/** What is wrong with who codes what. */
export function distributionProblems(answers: SetupAnswers): string[] {
  const d = answers.distribution;
  const problems: string[] = [];
  const n = answers.units?.units.length ?? 0;
  const needsUnits = (what: string) => !answers.units && problems.push(`${what} needs the units now`);
  if ("overlap" in d && d.overlap !== null) {
    needsUnits("An overlap");
    if (!(d.overlap >= 1)) problems.push("The overlap: a number of units, at least 1");
  }
  if (d.mode === "sets") {
    needsUnits("Assigning sets");
    if (answers.units && d.source === "split" && (d.sets < 1 || d.sets > n)) problems.push(`Between 1 and ${n} sets`);
    if (answers.units && d.source === "column" && !answers.units.fields.some((f) => f.name === d.column))
      problems.push("Choose the column that holds each unit's set");
  }
  if (d.mode === "crowd") {
    // The queue's own rules; the question to agree on may be chosen later, in the editor.
    const parsed = CriteriaSchema.safeParse(d.shared);
    if (!parsed.success)
      problems.push(...parsed.error.issues.filter((i) => i.path.join(".") !== "until.on").map((i) => i.message));
  }
  if (d.mode === "groups") {
    if (!answers.parts.experiment) problems.push("Experimental groups need an experiment");
    needsUnits("Experimental groups");
    const empty = answers.experiment.conditions.filter((c) => c.trim() && !d.values[c]?.length);
    if (answers.units && empty.length > 0) problems.push(`Choose the units of ${empty.join(", ")}`);
  }
  return problems;
}

/** A question as the wizard makes it: by name, its answer type to choose in the editor. */
const unspecified = (q: SetupQuestion) => ({
  type: "question",
  name: q.name,
  variable: { type: "unspecified", ...(q.question ? { question: q.question } : {}) },
});

/**
 * The recipe for `POST /study/from-recipe`: a draft design, the units and
 * their columns with a role (`coder_set`, `condition_set`, `test_set`).
 * Deploying makes the links (one, or one per coder).
 */
export function setupRecipe(answers: SetupAnswers): RecipeInput {
  const lists = questionLists(answers.parts);
  const items: unknown[] = [];
  let session: SessionSpec | undefined;
  const groups: NonNullable<RecipeInput["sets"]> = [];
  const conditions = answers.experiment.conditions.map((c) => c.trim()).filter(Boolean);
  const linked = answers.parts.annotate && answers.distribution.mode === "groups";
  if (answers.parts.experiment) {
    // The condition: an experiment, drawn when reached (first); with groups, each condition gets
    // its own units (condition_set, a value per condition)
    items.push({
      type: "experiment",
      name: answers.experiment.name,
      variable: {
        type: "random",
        draw: answers.experiment.assign,
        options: conditions.map((c) =>
          linked && setName(c) !== c ? { value: setName(c), label: c } : { value: linked ? setName(c) : c },
        ),
        ...(linked ? { units: true } : {}),
      },
    });
  }
  items.push(...parseQuestions(answers.questions.before).map(unspecified));
  if (answers.parts.annotate) {
    const d = answers.distribution;
    const { sets, tests } = distributionSets(d, answers.units);
    // Test units: overlap (everyone's), and a column's practice and gold units; more can be marked on the Units page
    if (tests.length > 0) groups.push({ group: TEST_SET, sets: tests });
    let units: object = {};
    switch (d.mode) {
      case "all":
        break;
      case "sets":
        // The sets are the coders, a link each; the overlap spread through their units (the default)
        groups.push({ group: CODER_SET, sets });
        session = { invite: { mode: "coders", link: "per_coder" } };
        break;
      case "crowd":
        session = { invite: { mode: "crowd" } };
        // The loop divides its units among the coders (overlap spread, about one in ten without a maximum per coder)
        units = { divide: d.shared };
        break;
      case "groups":
        // condition_set, a value per condition: the condition (drawn before the loop) selects its units
        groups.push({
          group: CONDITION_SET,
          sets: conditions.map((condition) => {
            const values = d.values[condition] ?? [];
            return {
              name: setName(condition),
              units: (answers.units?.units ?? [])
                .filter((u) => values.includes(valueOf(u, d.column)))
                .map((u) => u.externalId),
            };
          }),
        });
        break;
    }
    // Gold and practice checks on the test units (assign sets, crowd coding)
    if (hasSetGroup(d))
      units = withChecks(
        units,
        answers.checks,
        parseQuestions(answers.questions.unit).map((q) => q.name),
      );
    items.push({
      type: "unit_loop",
      label: "Units",
      // Absent: all the session's units, once
      ...(Object.keys(units).length > 0 ? { units } : {}),
      ...(answers.order === "random" ? { order: "random" } : {}),
      // A layout item first (the editor can refine it), then the questions
      children: [
        { type: "layout", template: simpleTemplate(answers.layout) },
        ...parseQuestions(answers.questions.unit).map(unspecified),
      ],
    });
    if (lists.includes("after")) items.push(...parseQuestions(answers.questions.after).map(unspecified));
  }
  // The title coders see, only when given
  const title = answers.publicTitle.trim();
  return {
    name: answers.name.trim(),
    units: (answers.units?.units ?? []).map((u) => ({ id: u.externalId, data: u.data })),
    sets: groups.map((g) => ({ ...g, sets: g.sets.filter((s) => s.units.length > 0) })),
    design: {
      note: "Made with the setup wizard",
      ...(title ? { public: { title } } : {}),
      session: session ?? {},
      items,
    },
  };
}
