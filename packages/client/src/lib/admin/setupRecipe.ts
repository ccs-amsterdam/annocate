import type { RecipeInput, UnitCreate, UnitField, UnitData } from "@annotinder/contracts";

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

/** Who codes what (annotation). */
export type SetupDistribution =
  /** Every coder codes every unit. */
  | { mode: "all" }
  /** The units are shared out: each unit until `coders` coders coded it. */
  | { mode: "split"; coders: number }
  /** A set of units per condition, by a unit field holding the condition: each coder codes their condition's set. */
  | { mode: "byCondition"; field: string };

export interface SetupUnits {
  fields: UnitField[];
  units: UnitCreate[];
}

export interface SetupAnswers {
  name: string;
  parts: SetupParts;
  experiment: SetupExperiment;
  /** Annotation: the units (null: uploaded later), the fields coders see, and who codes what. */
  units: SetupUnits | null;
  shownFields: string[];
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
  shownFields: [],
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

/** The unitset of a condition (`byCondition`). */
export const conditionUnitset = (condition: string) => `condition_${condition}`;

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
  if (a.parts.annotate && a.distribution.mode === "byCondition") {
    if (!a.parts.experiment) problems.push("A set of units per condition needs an experiment");
    else if (!a.units) problems.push("A set of units per condition needs the units now");
    else {
      const field = a.distribution.field;
      const values = new Set(a.units.units.map((u) => String(u.data[field] ?? "")));
      const missing = a.experiment.conditions.filter((c) => !values.has(c));
      const unknown = [...values].filter((v) => !a.experiment.conditions.includes(v));
      if (missing.length > 0) problems.push(`No units for condition ${missing.join(", ")} in ${field}`);
      if (unknown.length > 0) problems.push(`${field} has values that aren't conditions: ${unknown.slice(0, 5).join(", ")}`);
    }
  }
  return problems;
}

/** The layout: each shown field on its own line (the editor's Layout tab refines it). */
export function layoutTemplate(shownFields: string[]): string {
  if (shownFields.length === 0) return "Upload units, then show their fields here: use the Insert menu above.";
  return shownFields.map((f) => `$unit.${f}`).join("\n\n");
}

const unspecified = (q: SetupQuestion) => ({
  type: "question",
  name: q.name,
  variable: { type: "unspecified", ...(q.question ? { question: q.question } : {}) },
});

/** The recipe for `POST /job/from-recipe`: a draft codebook, the units and one open invitation link. */
export function setupRecipe(a: SetupAnswers): RecipeInput {
  const lists = questionLists(a.parts);
  const items: unknown[] = [];
  if (a.parts.experiment) {
    items.push({
      type: "question",
      name: a.experiment.name,
      variable: {
        type: "auto",
        source: a.experiment.assign,
        options: a.experiment.conditions.map((c) => c.trim()).filter(Boolean).map((value) => ({ value })),
      },
    });
  }
  items.push(...parseQuestions(a.questions.before).map(unspecified));
  const unitsets: { name: string; units: string[] }[] = [];
  if (a.parts.annotate) {
    const d = a.distribution;
    const branch =
      d.mode === "split"
        ? { mode: "shared", unitset: "__all__", until: { coders: d.coders }, maxCoders: d.coders }
        : d.mode === "byCondition"
          ? { mode: "all", unitset: conditionUnitset(`$var.${a.experiment.name}.value`) }
          : { mode: "all", unitset: "__all__" };
    if (d.mode === "byCondition" && a.units) {
      for (const condition of a.experiment.conditions) {
        unitsets.push({
          name: conditionUnitset(condition),
          units: a.units.units.filter((u) => String((u.data as UnitData)[d.field] ?? "") === condition).map((u) => u.externalId),
        });
      }
    }
    items.push({
      type: "unit_loop",
      label: "Units",
      units: [branch],
      ...(a.order === "random" ? { order: "random" } : {}),
      layout: { template: layoutTemplate(a.shownFields) },
      children: parseQuestions(a.questions.unit).map(unspecified),
    });
    if (lists.includes("after")) items.push(...parseQuestions(a.questions.after).map(unspecified));
  }
  return {
    name: a.name.trim(),
    units: (a.units?.units ?? []).map((u) => ({ id: u.externalId, data: u.data })),
    unitsets,
    codebook: { note: "Made with the setup wizard", items },
    invites: [{ label: "Open link" }],
  };
}
