import { describe, expect, it } from "vitest";
import { RecipeSchema, validateCodebookItems } from "@annotinder/contracts";
import { DEFAULT_SETUP, parseQuestions, questionLists, setupProblems, setupRecipe, type SetupAnswers } from "./setupRecipe";

const units = {
  fields: [
    { name: "text", type: "text" as const },
    { name: "group", type: "text" as const },
  ],
  units: [
    { externalId: "a", data: { text: "one", group: "control" } },
    { externalId: "b", data: { text: "two", group: "treatment" } },
  ],
};
const setup = (patch: Partial<SetupAnswers>): SetupAnswers => ({ ...DEFAULT_SETUP, name: "Pilot", ...patch });
/** The validation issues of a recipe's codebook, besides the questions to specify. */
const otherIssues = (a: SetupAnswers) => {
  const recipe = RecipeSchema.parse(setupRecipe(a));
  return validateCodebookItems(recipe.codebook.items).filter((i) => !i.message.includes("no answer type yet"));
};

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

  it("annotation: a unit loop over all units, with the questions to specify", () => {
    const a = setup({ units, shownFields: ["text"], questions: { before: [], unit: ["topic", "tone"], after: [] } });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    expect(recipe.units).toHaveLength(2);
    expect(recipe.codebook.items).toEqual([
      {
        type: "unit_loop",
        label: "Units",
        units: [{ mode: "all", unitset: "__all__" }],
        layout: { template: "$unit.text" },
        children: [
          { type: "question", name: "topic", variable: { type: "unspecified" } },
          { type: "question", name: "tone", variable: { type: "unspecified" } },
        ],
      },
    ]);
  });

  it("split: a shared queue until n coders", () => {
    const a = setup({ distribution: { mode: "split", coders: 2 }, questions: { before: [], unit: ["topic"], after: [] } });
    expect(otherIssues(a)).toEqual([]);
    expect((setupRecipe(a).codebook.items[0] as { units: unknown[] }).units).toEqual([
      { mode: "shared", unitset: "__all__", until: { coders: 2 }, maxCoders: 2 },
    ]);
  });

  it("an experiment with annotation: the condition first, a set of units per condition, questions before and after", () => {
    const a = setup({
      parts: { annotate: true, survey: false, experiment: true },
      units,
      shownFields: ["text"],
      distribution: { mode: "byCondition", field: "group" },
      questions: { before: ["age"], unit: ["topic"], after: ["Any comments?"] },
    });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    expect(recipe.unitsets).toEqual([
      { name: "condition_control", units: ["a"] },
      { name: "condition_treatment", units: ["b"] },
    ]);
    const items = recipe.codebook.items as { name?: string; type: string; units?: unknown }[];
    expect(items.map((i) => i.name ?? i.type)).toEqual(["condition", "age", "unit_loop", "any_comments"]);
    expect(items[2].units).toEqual([{ mode: "all", unitset: "condition_$var.condition.value" }]);
  });

  it("a survey alone, or an experiment alone (a survey with an experiment)", () => {
    const survey = setup({ parts: { annotate: false, survey: true, experiment: false }, questions: { before: ["age"], unit: [], after: [] } });
    expect(setupProblems(survey)).toEqual([]);
    expect(setupRecipe(survey).codebook.items).toEqual([{ type: "question", name: "age", variable: { type: "unspecified" } }]);
    const experiment = setup({ parts: { annotate: false, survey: false, experiment: true }, questions: { before: ["support"], unit: [], after: [] } });
    expect(otherIssues(experiment)).toEqual([]);
    expect(setupRecipe(experiment).codebook.items).toHaveLength(2);
  });

  it("say what is missing or wrong", () => {
    expect(setupProblems(setup({ name: "", parts: { annotate: false, survey: false, experiment: false } }))).toEqual([
      "Give the job a name",
      "Choose at least one of annotate, survey or experiment",
      "Add at least one question",
    ]);
    const twice = setup({ parts: { annotate: true, survey: true, experiment: false }, questions: { before: ["Age"], unit: ["age"], after: [] } });
    expect(setupProblems(twice)).toEqual(["Each question once: age"]);
    const byCondition = setup({
      parts: { annotate: true, survey: false, experiment: true },
      experiment: { name: "condition", conditions: ["control", "other"], assign: "random" },
      units,
      distribution: { mode: "byCondition", field: "group" },
      questions: { before: [], unit: ["topic"], after: [] },
    });
    expect(setupProblems(byCondition)).toEqual(["No units for condition other in group", "group has values that aren't conditions: treatment"]);
  });
});
