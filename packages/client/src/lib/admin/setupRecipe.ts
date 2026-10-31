import { OVERLAP_SET, SharedBranchSchema, seededShuffle, type RecipeInput, type SharedBranch, type UnitCreate, type UnitField, type UnitData } from "@annotinder/contracts";
import { simpleTemplate, type SimpleLayout } from "../codebook/simpleLayout";

// The setup wizard (docs/plans/setup-wizard.md) as data: what the
// researcher chose, and the recipe it makes. The wizard asks no question
// details: questions are made by name, with no answer type yet, to specify
// in the editor.

/** Which parts the job has. An experiment alone is a survey with an experiment. */
export interface SetupParts {
  annotate: boolean;
  survey: boolean;
  experiment: boolean;
}

export interface SetupExperiment {
  /** The condition's name (an `auto` question). */
  name: string;
  /** The conditions' values. */
  conditions: string[];
  /** `random`: a random draw per participant; `balanced`: the condition with the fewest participants so far. */
  assign: "random" | "balanced";
}

/** Units every coder codes besides their own, for checking agreement: a number of units, or a percentage of all units. */
export type SetupOverlap = { by: "units" | "percent"; value: number } | null;

/** Who codes what (annotation), each with its own settings. */
export type SetupDistribution =
  /** Every coder codes every unit. */
  | { mode: "all" }
  /**
   * The units in sets, each coder one set: `split` into `sets` sets, or one
   * set per value of `column`. Handed out by an invitation link per set
   * (`links`), or by one link giving each new coder the set with the fewest
   * coders (`rotate`).
   */
  | { mode: "sets"; source: "split" | "column"; sets: number; column: string; overlap: SetupOverlap; handOut: "links" | "rotate" }
  /**
   * Crowd coding: a shared queue, with the settings the editor's form has
   * (`shared`: until N coders or N agree, max coders, units per coder,
   * priority; its unitset is set by the wizard), and optionally overlap units.
   */
  | { mode: "crowd"; shared: SharedBranch; overlap: SetupOverlap }
  /** A set per experimental condition: the units whose `column` has one of the condition's values. */
  | { mode: "groups"; column: string; values: Record<string, string[]> }
  /** Decided later in the editor: the loop's units are not set. */
  | { mode: "later" };

export const DISTRIBUTIONS: { mode: SetupDistribution["mode"]; label: string; help: string }[] = [
  { mode: "all", label: "Everyone codes everything", help: "Every coder codes every unit." },
  {
    mode: "sets",
    label: "Assign sets",
    help: "The units are divided into sets (or by a column), and each coder codes one set, optionally plus overlap units everyone codes. Also the classic design with a few expert coders.",
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
  { mode: "later", label: "Decide later (advanced)", help: "Set who codes which units in the editor: the loop is marked to specify." },
];

/** The settings an option starts with. */
export function defaultDistribution(mode: SetupDistribution["mode"], columns: string[] = []): SetupDistribution {
  switch (mode) {
    case "all":
    case "later":
      return { mode };
    case "sets":
      return { mode, source: "split", sets: 2, column: columns[0] ?? "", overlap: null, handOut: "rotate" };
    case "crowd":
      return { mode, shared: { mode: "shared", until: { coders: 1 }, maxCoders: 1 }, overlap: null };
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
  parts: SetupParts;
  experiment: SetupExperiment;
  /** Annotation: the units (null: uploaded later), how a unit is shown, and who codes what. */
  units: SetupUnits | null;
  layout: SimpleLayout;
  distribution: SetupDistribution;
  order: "sequential" | "random";
  /** Question lines, as typed: before the units (or the survey's), per unit, after the units. */
  questions: { before: string[]; unit: string[]; after: string[] };
}

export const DEFAULT_SETUP: SetupAnswers = {
  name: "",
  parts: { annotate: true, survey: false, experiment: false },
  experiment: { name: "condition", conditions: ["control", "treatment"], assign: "balanced" },
  units: null,
  layout: { body: [] },
  distribution: { mode: "all" },
  order: "sequential",
  questions: { before: [], unit: [], after: [] },
};

/** Where questions go: a survey (or experiment) alone has one list; annotation with either has three. */
export function questionLists(parts: SetupParts): ("before" | "unit" | "after")[] {
  const asks = parts.survey || parts.experiment;
  if (!parts.annotate) return ["before"];
  return asks ? ["before", "unit", "after"] : ["unit"];
}

/** A question's name from what was typed: `How old are you?` -> `how_old_are_you`. */
export function questionName(line: string): string {
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

/** The group the wizard puts its sets in. */
export const WIZARD_GROUP = "sets";

/** A set's name from a column's value: no `;` or `#`, and no leading `_` (reserved). */
const setName = (value: string) => value.trim().replace(/[;#]+/g, "_").replace(/^_+/, "").slice(0, 128) || "empty";

/** A unit's value in a column, as text. */
const valueOf = (unit: UnitCreate, column: string) => String((unit.data as UnitData)[column] ?? "");

/** The distinct values of a column, in the units' order. */
export function columnValues(units: SetupUnits | null, column: string): string[] {
  return [...new Set((units?.units ?? []).map((u) => valueOf(u, column)))];
}

/** How many units an overlap takes of `n`. */
export function overlapCount(overlap: SetupOverlap, n: number): number {
  if (!overlap) return 0;
  return Math.min(n, overlap.by === "units" ? Math.max(0, Math.round(overlap.value)) : Math.round((overlap.value / 100) * n));
}

/**
 * The sets a distribution makes (of the wizard's group), and the overlap
 * units (if any): drawn at random (fixed seed) and taken out of the sets.
 */
export function distributionSets(d: SetupDistribution, units: SetupUnits | null): { sets: { name: string; units: string[] }[]; overlap: string[] } {
  const ids = (units?.units ?? []).map((u) => u.externalId);
  const overlapIds = "overlap" in d ? seededShuffle(ids, 1).slice(0, overlapCount(d.overlap, ids.length)) : [];
  const inOverlap = new Set(overlapIds);
  const rest = (units?.units ?? []).filter((u) => !inOverlap.has(u.externalId));
  if (d.mode === "sets") {
    if (d.source === "column") {
      const sets = columnValues({ fields: [], units: rest }, d.column).map((value) => ({
        name: setName(value),
        units: rest.filter((u) => valueOf(u, d.column) === value).map((u) => u.externalId),
      }));
      return { sets, overlap: overlapIds };
    }
    const n = Math.max(1, d.sets);
    const shuffled = seededShuffle(
      rest.map((u) => u.externalId),
      2,
    );
    const sets = Array.from({ length: n }, (_, i) => ({ name: `s${i + 1}`, units: shuffled.filter((_, j) => j % n === i) }));
    return { sets, overlap: overlapIds };
  }
  if (d.mode === "crowd") return { sets: overlapIds.length > 0 ? [{ name: "queue", units: rest.map((u) => u.externalId) }] : [], overlap: overlapIds };
  return { sets: [], overlap: [] };
}

/** What stops the wizard at a step; empty: fine. */
export function setupProblems(a: SetupAnswers): string[] {
  const problems: string[] = [];
  if (!a.name.trim()) problems.push("Give the job a name");
  if (!a.parts.annotate && !a.parts.survey && !a.parts.experiment) problems.push("Choose at least one of annotate, survey or experiment");
  const lists = questionLists(a.parts);
  const names = new Map<string, number>();
  const add = (name: string) => names.set(name, (names.get(name) ?? 0) + 1);
  if (a.parts.experiment) {
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(a.experiment.name)) problems.push("The condition's name: letters, digits and _ only");
    add(a.experiment.name);
    const conditions = a.experiment.conditions.map((c) => c.trim()).filter(Boolean);
    if (conditions.length < 2) problems.push("An experiment needs at least two conditions");
    if (new Set(conditions).size !== conditions.length) problems.push("Each condition once");
  }
  for (const list of lists) {
    for (const q of parseQuestions(a.questions[list])) {
      if (!q.name) problems.push(`"${a.questions[list].find((l) => questionName(l) === q.name) ?? ""}" makes no name: use letters or digits`);
      else add(q.name);
    }
  }
  const twice = [...names].filter(([, n]) => n > 1).map(([name]) => name);
  if (twice.length > 0) problems.push(`Each question once: ${twice.join(", ")}`);
  if (a.parts.annotate && parseQuestions(a.questions.unit).length === 0) problems.push("Add at least one question about each unit");
  if (!a.parts.annotate && parseQuestions(a.questions.before).length === 0) problems.push("Add at least one question");
  if (a.parts.annotate) problems.push(...distributionProblems(a));
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
    if (d.overlap.value <= 0 || (d.overlap.by === "percent" && d.overlap.value > 100)) problems.push("The overlap: a number of units, or a percentage up to 100");
  }
  if (d.mode === "sets") {
    needsUnits("Assigning sets");
    if (a.units && d.source === "split" && (d.sets < 1 || d.sets > n)) problems.push(`Between 1 and ${n} sets`);
    if (a.units && d.source === "column" && !a.units.fields.some((f) => f.name === d.column)) problems.push("Choose the column that holds each unit's set");
  }
  if (d.mode === "crowd") {
    // The queue's own rules; the question to agree on may be chosen later, in the editor.
    const parsed = SharedBranchSchema.safeParse(d.shared);
    if (!parsed.success) problems.push(...parsed.error.issues.filter((i) => i.path.join(".") !== "until.on").map((i) => i.message));
  }
  if (d.mode === "groups") {
    if (!a.parts.experiment) problems.push("Experimental groups need an experiment");
    needsUnits("Experimental groups");
    const empty = a.experiment.conditions.filter((c) => c.trim() && !(d.values[c]?.length));
    if (a.units && empty.length > 0) problems.push(`Choose the units of ${empty.join(", ")}`);
  }
  return problems;
}

/** The layout's template (the editor's Layout tab refines it). */
export function layoutTemplate(layout: SimpleLayout): string {
  return simpleTemplate(layout);
}

const unspecified = (q: SetupQuestion) => ({
  type: "question",
  name: q.name,
  variable: { type: "unspecified", ...(q.question ? { question: q.question } : {}) },
});

/**
 * The recipe for `POST /job/from-recipe`: a draft codebook, the units and
 * their sets. Publishing makes the links (one, or one per set when sets
 * are handed out by link).
 */
export function setupRecipe(a: SetupAnswers): RecipeInput {
  const lists = questionLists(a.parts);
  const items: unknown[] = [];
  const groups: NonNullable<RecipeInput["sets"]> = [];
  const conditions = a.experiment.conditions.map((c) => c.trim()).filter(Boolean);
  if (a.parts.experiment) {
    items.push({
      type: "question",
      name: a.experiment.name,
      variable: { type: "auto", source: a.experiment.assign, options: conditions.map((value) => ({ value })) },
    });
  }
  items.push(...parseQuestions(a.questions.before).map(unspecified));
  if (a.parts.annotate) {
    const d = a.distribution;
    const { sets, overlap } = distributionSets(d, a.units);
    const overlapSet = overlap.length > 0 ? [{ name: OVERLAP_SET, units: overlap }] : [];
    let branches: object[] = [];
    switch (d.mode) {
      case "all":
        branches = [{ mode: "all" }];
        break;
      case "sets":
        groups.push({ group: WIZARD_GROUP, sets: [...sets, ...overlapSet] });
        branches = [
          {
            mode: "assign",
            group: WIZARD_GROUP,
            from: d.handOut === "links" ? { session: "set" } : { draw: "balanced" },
            // Spread: best practice (first inflates reliability: coders are fresh and careful)
            overlap: { placement: overlap.length > 0 ? "spread" : "disabled" },
          },
        ];
        // A link per set: a link parameter with the group's sets
        if (d.handOut === "links") items.unshift({ type: "session", params: [{ name: "set", kind: "link", values: { sets: WIZARD_GROUP } }] });
        break;
      case "crowd":
        if (overlap.length > 0) {
          groups.push({ group: WIZARD_GROUP, sets: [{ name: "queue", units: sets[0]?.units ?? [] }, ...overlapSet] });
          // Spread needs the units per coder (max); without it the overlap comes last
          branches = [{ ...d.shared, set: { group: WIZARD_GROUP, set: "queue" }, overlap: { placement: d.shared.maxUnits !== undefined ? "spread" : "last" } }];
        } else branches = [d.shared];
        break;
      case "groups":
        // A set per condition, and a coder group per condition that codes its set
        groups.push({
          group: WIZARD_GROUP,
          sets: conditions.map((condition) => {
            const values = d.values[condition] ?? [];
            return { name: setName(condition), units: (a.units?.units ?? []).filter((u) => values.includes(valueOf(u, d.column))).map((u) => u.externalId) };
          }),
        });
        branches = conditions.map((condition) => ({
          when: { script: `$var.${a.experiment.name}.is(${JSON.stringify(condition)})` },
          mode: "all",
          set: { group: WIZARD_GROUP, set: setName(condition) },
        }));
        break;
      case "later":
        branches = [];
    }
    items.push({
      type: "unit_loop",
      label: "Units",
      units: branches,
      ...(a.order === "random" ? { order: "random" } : {}),
      layout: { template: layoutTemplate(a.layout) },
      children: parseQuestions(a.questions.unit).map(unspecified),
    });
    if (lists.includes("after")) items.push(...parseQuestions(a.questions.after).map(unspecified));
  }
  return {
    name: a.name.trim(),
    units: (a.units?.units ?? []).map((u) => ({ id: u.externalId, data: u.data })),
    sets: groups.map((g) => ({ ...g, sets: g.sets.filter((s) => s.units.length > 0) })),
    codebook: { note: "Made with the setup wizard", items },
  };
}
