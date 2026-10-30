import { describe, expect, it } from "vitest";
import { RecipeSchema, validateCodebookItems } from "@annotinder/contracts";
import { DEFAULT_SETUP, defaultDistribution, parseQuestions, questionLists, setupProblems, setupRecipe, type SetupAnswers } from "./setupRecipe";

const units = {
  fields: [
    { name: "text", type: "text" as const },
    { name: "group", type: "text" as const },
  ],
  units: Array.from({ length: 10 }, (_, i) => ({ externalId: `u${i}`, data: { text: `text ${i}`, group: i < 4 ? "a" : i < 8 ? "b" : "c" } })),
};
const setup = (patch: Partial<SetupAnswers>): SetupAnswers => ({
  ...DEFAULT_SETUP,
  name: "Pilot",
  units,
  layout: { body: ["text"] },
  questions: { before: [], unit: ["topic"], after: [] },
  ...patch,
});
/** The validation issues of a recipe's codebook, besides the questions to specify. */
const otherIssues = (a: SetupAnswers) => {
  const recipe = RecipeSchema.parse(setupRecipe(a));
  return validateCodebookItems(recipe.codebook.items).filter((i) => !i.message.includes("no answer type yet"));
};
const loopOf = (a: SetupAnswers) => (setupRecipe(a).codebook.items as { type: string; units?: unknown[]; layout?: { template: string } }[]).find((i) => i.type === "unit_loop")!;

describe("setup wizard recipes", () => {
  it("turn typed lines into question names, keeping the text as the question", () => {
    expect(parseQuestions(["age", " How old are you? ", "", "Política"])).toEqual([
      { name: "age" },
      { name: "how_old_are_you", question: "How old are you?" },
      { name: "politica", question: "Política" },
    ]);
  });

  it("ask in one list, or before, per unit and after with annotation plus a survey or experiment", () => {
    expect(questionLists({ annotate: true, survey: false, experiment: false })).toEqual(["unit"]);
    expect(questionLists({ annotate: false, survey: true, experiment: false })).toEqual(["before"]);
    expect(questionLists({ annotate: false, survey: false, experiment: true })).toEqual(["before"]);
    expect(questionLists({ annotate: true, survey: false, experiment: true })).toEqual(["before", "unit", "after"]);
  });

  it("everyone codes everything: a loop over all units, laid out as chosen", () => {
    const a = setup({ layout: { title: "group", body: ["text"] } });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    expect(loopOf(a)).toMatchObject({ units: [{ mode: "all", unitset: "__all__" }], layout: { template: "# $unit.group\n\n$unit.text" } });
    expect(setupRecipe(a).invites).toEqual([{ label: "Open link" }]);
  });

  it("assign sets: split, with overlap, handed out by one rotating link", () => {
    const a = setup({ distribution: { ...defaultDistribution("sets"), sets: 3, overlap: { by: "percent", value: 20 } } as SetupAnswers["distribution"] });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    const sizes = Object.fromEntries(recipe.unitsets!.map((s) => [s.name, s.units.length]));
    expect(sizes).toEqual({ set_1: 3, set_2: 3, set_3: 2, overlap: 2 });
    // Every unit once
    expect(new Set(recipe.unitsets!.flatMap((s) => s.units)).size).toBe(10);
    expect(loopOf(a).units).toEqual([{ mode: "sets", unitsets: ["set_1", "set_2", "set_3"], overlap: { unitset: "overlap" } }]);
  });

  it("assign sets by a column, an invitation link per set", () => {
    const a = setup({ distribution: { mode: "sets", source: "column", sets: 0, column: "group", overlap: null, handOut: "links" } });
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    expect(recipe.unitsets!.map((s) => [s.name, s.units.length])).toEqual([
      ["set_a", 4],
      ["set_b", 4],
      ["set_c", 2],
    ]);
    expect(recipe.invites).toEqual([
      { label: "Set a", unitset: "set_a" },
      { label: "Set b", unitset: "set_b" },
      { label: "Set c", unitset: "set_c" },
    ]);
    expect(loopOf(a).units).toEqual([{ mode: "invitation" }]);
  });

  it("crowd coding: until coders agree, with limits per coder and an overlap", () => {
    const a = setup({
      questions: { before: [], unit: ["sentiment", "topic"], after: [] },
      distribution: {
        mode: "crowd",
        shared: { mode: "shared", unitset: "__all__", until: { agree: 2, on: "sentiment" }, maxCoders: 3, minUnits: 2, maxUnits: 5 },
        overlap: { by: "units", value: 2 },
      },
    });
    expect(setupProblems(a)).toEqual([]);
    // The agreement question needs a categorical type: reported until it is specified
    expect(otherIssues(a).map((i) => i.message)).toEqual([expect.stringContaining("sentiment")]);
    expect(loopOf(a).units).toEqual([
      { mode: "shared", unitset: "queue", until: { agree: 2, on: "sentiment" }, maxCoders: 3, minUnits: 2, maxUnits: 5, overlap: { unitset: "overlap" } },
    ]);
    expect(setupRecipe(a).unitsets!.map((s) => [s.name, s.units.length])).toEqual([
      ["queue", 8],
      ["overlap", 2],
    ]);
  });

  it("crowd coding without overlap: a queue over all units", () => {
    const a = setup({ distribution: { mode: "crowd", shared: { mode: "shared", unitset: "__all__", until: { coders: 2 }, maxCoders: 2 }, overlap: null } });
    expect(otherIssues(a)).toEqual([]);
    expect(loopOf(a).units).toEqual([{ mode: "shared", unitset: "__all__", until: { coders: 2 }, maxCoders: 2 }]);
    expect(setupRecipe(a).unitsets).toEqual([]);
  });

  it("experimental groups: the condition first, a set per condition by chosen values, questions before and after", () => {
    const a = setup({
      parts: { annotate: true, survey: false, experiment: true },
      distribution: { mode: "groups", column: "group", values: { control: ["a"], treatment: ["b", "c"] } },
      questions: { before: ["age"], unit: ["topic"], after: ["Any comments?"] },
    });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    expect(recipe.unitsets!.map((s) => [s.name, s.units.length])).toEqual([
      ["condition_control", 4],
      ["condition_treatment", 6],
    ]);
    const items = recipe.codebook.items as { name?: string; type: string }[];
    expect(items.map((i) => i.name ?? i.type)).toEqual(["condition", "age", "unit_loop", "any_comments"]);
    expect(loopOf(a).units).toEqual([{ mode: "all", unitset: "condition_$var.condition.value" }]);
  });

  it("decide later: the loop's units are not set, and reported", () => {
    const a = setup({ distribution: { mode: "later" } });
    expect(setupProblems(a)).toEqual([]);
    expect(loopOf(a).units).toEqual([]);
    expect(otherIssues(a).map((i) => i.message)).toEqual([expect.stringContaining("isn't set yet")]);
  });

  it("a survey alone, or an experiment alone (a survey with an experiment)", () => {
    const survey = setup({ parts: { annotate: false, survey: true, experiment: false }, units: null, questions: { before: ["age"], unit: [], after: [] } });
    expect(setupProblems(survey)).toEqual([]);
    expect(setupRecipe(survey).codebook.items).toEqual([{ type: "question", name: "age", variable: { type: "unspecified" } }]);
    const experiment = setup({ parts: { annotate: false, survey: false, experiment: true }, units: null, questions: { before: ["support"], unit: [], after: [] } });
    expect(otherIssues(experiment)).toEqual([]);
    expect(setupRecipe(experiment).codebook.items).toHaveLength(2);
  });

  it("say what is missing or wrong", () => {
    expect(setupProblems(setup({ name: "", parts: { annotate: false, survey: false, experiment: false }, questions: { before: [], unit: [], after: [] } }))).toEqual([
      "Give the job a name",
      "Choose at least one of annotate, survey or experiment",
      "Add at least one question",
    ]);
    const twice = setup({ parts: { annotate: true, survey: true, experiment: false }, questions: { before: ["Age"], unit: ["age"], after: [] } });
    expect(setupProblems(twice)).toEqual(["Each question once: age"]);
    // The queue's own rules; the question to agree on can wait for the editor
    const crowd = setup({ distribution: { mode: "crowd", shared: { mode: "shared", unitset: "__all__", until: { agree: 2, on: "" }, maxCoders: 1 }, overlap: null } });
    expect(setupProblems(crowd)).toEqual([expect.stringContaining("Max coders must be at least")]);
    const groups = setup({
      parts: { annotate: true, survey: false, experiment: true },
      distribution: { mode: "groups", column: "group", values: { control: ["a"] } },
    });
    expect(setupProblems(groups)).toEqual(["Choose the units of treatment"]);
    expect(setupProblems(setup({ units: null, distribution: defaultDistribution("sets") }))).toEqual(["Assigning sets needs the units now"]);
  });
});
