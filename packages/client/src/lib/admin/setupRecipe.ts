import {
  CriteriaSchema,
  OVERLAP_SET,
  RESERVED_SETS,
  seededShuffle,
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
  /** The condition's name (a computed item, drawn at random). */
  name: string;
  /** The conditions' values. */
  conditions: string[];
  /** `random`: a random draw per coder; `balanced`: the condition with the fewest coders so far. */
  assign: "random" | "balanced";
}

/** Units every coder codes besides their own, for checking agreement: a number of units, or a percentage of all units. */
export type SetupOverlap = { by: "units" | "percent"; value: number } | null;

/** Who codes what (annotation), each with its own settings. */
export type SetupDistribution =
  /** Every coder codes every unit. */
  | { mode: "all" }
  /**
   * The units in sets, each a coder's (a link each): `split` into `sets`
   * sets (`coder_1` ...), or one set per value of `column`.
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
  /** A set per experimental condition: the units whose `column` has one of the condition's values. */
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

/** The set column the wizard puts its sets in: the coders. */
const WIZARD_GROUP = "coders";

/** A set's name from a column's value: no `;` or `#`, and no leading `_` (reserved). */
const setName = (value: string) =>
  (RESERVED_SETS as readonly string[]).includes(value.trim())
    ? value.trim()
    : value.trim().replace(/[;#]+/g, "_").replace(/^_+/, "").slice(0, 128) || "empty";

/** Whether a distribution puts the units in sets of a group: then gold and practice units can be mixed in. */
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
  if (!overlap) return 0;
  return Math.min(
    n,
    overlap.by === "units" ? Math.max(0, Math.round(overlap.value)) : Math.round((overlap.value / 100) * n),
  );
}

/**
 * The sets a distribution makes (of the wizard's group), and the overlap
 * units (if any): drawn at random (fixed seed) and taken out of the sets.
 */
export function distributionSets(
  d: SetupDistribution,
  units: SetupUnits | null,
): { sets: { name: string; units: string[] }[]; overlap: string[] } {
  const ids = (units?.units ?? []).map((u) => u.externalId);
  // Units a column already puts in a special set (_gold, _practice, _overlap) aren't drawn for the overlap
  const special = new Set(
    d.mode === "sets" && d.source === "column"
      ? (units?.units ?? [])
          .filter((u) => (RESERVED_SETS as readonly string[]).includes(valueOf(u, d.column).trim()))
          .map((u) => u.externalId)
      : [],
  );
  const drawable = ids.filter((id) => !special.has(id));
  const overlapIds = "overlap" in d ? seededShuffle(drawable, 1).slice(0, overlapCount(d.overlap, ids.length)) : [];
  const inOverlap = new Set(overlapIds);
  const rest = (units?.units ?? []).filter((u) => !inOverlap.has(u.externalId));
  if (d.mode === "sets") {
    if (d.source === "column") {
      // By set name: values that make the same name (e.g. "a;b" and "a#b") are one set
      const byName = new Map<string, string[]>();
      for (const u of rest) {
        const name = setName(valueOf(u, d.column));
        byName.set(name, [...(byName.get(name) ?? []), u.externalId]);
      }
      // A column's _overlap units join the drawn overlap
      const overlap = [...overlapIds, ...(byName.get(OVERLAP_SET) ?? [])];
      byName.delete(OVERLAP_SET);
      return { sets: [...byName].map(([name, units]) => ({ name, units })), overlap };
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
    return { sets, overlap: overlapIds };
  }
  if (d.mode === "crowd")
    return {
      sets: overlapIds.length > 0 ? [{ name: "queue", units: rest.map((u) => u.externalId) }] : [],
      overlap: overlapIds,
    };
  return { sets: [], overlap: [] };
}

/** What stops the wizard at a step; empty: fine. */
export function setupProblems(a: SetupAnswers): string[] {
  const problems: string[] = [];
  if (!a.name.trim()) problems.push("Give the study a name");
  if (!a.parts.annotate && !a.parts.survey && !a.parts.experiment)
    problems.push("Choose at least one of annotate, survey or experiment");
  const lists = questionLists(a.parts);
  const names = new Map<string, number>();
  const add = (name: string) => names.set(name, (names.get(name) ?? 0) + 1);
  if (a.parts.experiment) {
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(a.experiment.name))
      problems.push("The condition's name: letters, digits and _ only");
    add(a.experiment.name);
    const conditions = a.experiment.conditions.map((c) => c.trim()).filter(Boolean);
    if (conditions.length < 2) problems.push("An experiment needs at least two conditions");
    if (new Set(conditions).size !== conditions.length) problems.push("Each condition once");
  }
  for (const list of lists) {
    for (const q of parseQuestions(a.questions[list])) {
      if (!q.name)
        problems.push(
          `"${a.questions[list].find((l) => questionName(l) === q.name) ?? ""}" makes no name: use letters or digits`,
        );
      else add(q.name);
    }
  }
  const twice = [...names].filter(([, n]) => n > 1).map(([name]) => name);
  if (twice.length > 0) problems.push(`Each question once: ${twice.join(", ")}`);
  if (a.parts.annotate && parseQuestions(a.questions.unit).length === 0)
    problems.push("Add at least one question about each unit");
  if (!a.parts.annotate && parseQuestions(a.questions.before).length === 0) problems.push("Add at least one question");
  if (a.parts.annotate) problems.push(...distributionProblems(a));
  // With units: something of each unit is shown
  if (a.parts.annotate && a.units && placedFields(a.layout).length === 0)
    problems.push("Choose what coders see of each unit (How coders see a unit)");
  return problems;
}

/** What is wrong with who codes what. */
export function distributionProblems(a: SetupAnswers): string[] {
  const d = a.distribution;
  const problems: string[] = [];
  const n = a.units?.units.length ?? 0;
  const needsUnits = (what: string) => !a.units && problems.push(`${what} needs the units now`);
  if ("overlap" in d && d.overlap) {
    needsUnits("An overlap");
    if (d.overlap.value <= 0 || (d.overlap.by === "percent" && d.overlap.value > 100))
      problems.push("The overlap: a number of units, or a percentage up to 100");
  }
  if (d.mode === "sets") {
    needsUnits("Assigning sets");
    if (a.units && d.source === "split" && (d.sets < 1 || d.sets > n)) problems.push(`Between 1 and ${n} sets`);
    if (a.units && d.source === "column" && !a.units.fields.some((f) => f.name === d.column))
      problems.push("Choose the column that holds each unit's set");
  }
  if (d.mode === "crowd") {
    // The queue's own rules; the question to agree on may be chosen later, in the editor.
    const parsed = CriteriaSchema.safeParse(d.shared);
    if (!parsed.success)
      problems.push(...parsed.error.issues.filter((i) => i.path.join(".") !== "until.on").map((i) => i.message));
  }
  if (d.mode === "groups") {
    if (!a.parts.experiment) problems.push("Experimental groups need an experiment");
    needsUnits("Experimental groups");
    const empty = a.experiment.conditions.filter((c) => c.trim() && !d.values[c]?.length);
    if (a.units && empty.length > 0) problems.push(`Choose the units of ${empty.join(", ")}`);
  }
  return problems;
}

/** The layout's template (the editor's Layout tab refines it). */
function layoutTemplate(layout: SimpleLayout): string {
  return simpleTemplate(layout);
}

const unspecified = (q: SetupQuestion) => ({
  type: "question",
  name: q.name,
  variable: { type: "unspecified", ...(q.question ? { question: q.question } : {}) },
});

/**
 * The recipe for `POST /study/from-recipe`: a draft design, the units and
 * their sets. Deploying makes the links (one, or one per set when sets
 * are handed out by link).
 */
export function setupRecipe(a: SetupAnswers): RecipeInput {
  const lists = questionLists(a.parts);
  const items: unknown[] = [];
  let session: SessionSpec | undefined;
  const groups: NonNullable<RecipeInput["sets"]> = [];
  const conditions = a.experiment.conditions.map((c) => c.trim()).filter(Boolean);
  const linked = a.parts.annotate && a.distribution.mode === "groups";
  if (a.parts.experiment) {
    // The condition: a computed item, drawn when reached (first); linked to a column, it selects the
    // units (a set column named after it, a value per condition)
    items.push({
      type: "computed",
      name: a.experiment.name,
      variable: {
        type: "random",
        draw: a.experiment.assign,
        options: conditions.map((c) =>
          linked && setName(c) !== c ? { value: setName(c), label: c } : { value: linked ? setName(c) : c },
        ),
        ...(linked ? { units: a.experiment.name } : {}),
      },
    });
  }
  items.push(...parseQuestions(a.questions.before).map(unspecified));
  if (a.parts.annotate) {
    const d = a.distribution;
    const { sets, overlap } = distributionSets(d, a.units);
    const overlapSet = overlap.length > 0 ? [{ name: OVERLAP_SET, units: overlap }] : [];
    let units: object = {};
    switch (d.mode) {
      case "all":
        break;
      case "sets":
        // The sets are the coders, a link each; the overlap spread through their units (the default)
        groups.push({ group: WIZARD_GROUP, sets: [...sets, ...overlapSet] });
        session = { invite: { mode: "coders", column: WIZARD_GROUP, link: "per_coder" } };
        break;
      case "crowd":
        // The overlap: everyone's (a column's _overlap, without a column dividing the units)
        if (overlap.length > 0) groups.push({ group: WIZARD_GROUP, sets: overlapSet });
        // A shared queue: the crowd invitation's (overlap spread, about one in ten without a maximum per coder)
        session = { invite: { mode: "crowd", share: d.shared } };
        break;
      case "groups":
        // A set column named after the condition, a value per condition: the condition (drawn before the loop) selects its units
        groups.push({
          group: a.experiment.name,
          sets: conditions.map((condition) => {
            const values = d.values[condition] ?? [];
            return {
              name: setName(condition),
              units: (a.units?.units ?? [])
                .filter((u) => values.includes(valueOf(u, d.column)))
                .map((u) => u.externalId),
            };
          }),
        });
        break;
    }
    // Gold and practice checks on the special units (assign sets, crowd coding)
    if (hasSetGroup(d))
      units = withChecks(
        units,
        a.checks,
        parseQuestions(a.questions.unit).map((q) => q.name),
      );
    items.push({
      type: "unit_loop",
      label: "Units",
      // Absent: all the session's units, once
      ...(Object.keys(units).length > 0 ? { units } : {}),
      ...(a.order === "random" ? { order: "random" } : {}),
      layout: { template: layoutTemplate(a.layout) },
      children: parseQuestions(a.questions.unit).map(unspecified),
    });
    if (lists.includes("after")) items.push(...parseQuestions(a.questions.after).map(unspecified));
  }
  // The title coders see, only when given
  const title = a.publicTitle.trim();
  const study: SessionSpec = session ?? {};
  return {
    name: a.name.trim(),
    units: (a.units?.units ?? []).map((u) => ({ id: u.externalId, data: u.data })),
    sets: groups.map((g) => ({ ...g, sets: g.sets.filter((s) => s.units.length > 0) })),
    design: {
      note: "Made with the setup wizard",
      ...(title ? { public: { title } } : {}),
      session: study,
      items,
    },
  };
}
