import { describe, expect, it } from "vitest";
import { RecipeSchema, designItems, validateDesignItems } from "@annotinder/contracts";
import {
  DEFAULT_SETUP,
  defaultDistribution,
  parseQuestions,
  questionLists,
  setupProblems,
  setupRecipe,
  type SetupAnswers,
} from "./setupRecipe";

const setupUnits = {
  fields: [
    { name: "text", type: "text" as const },
    { name: "group", type: "text" as const },
  ],
  units: Array.from({ length: 10 }, (_, i) => ({
    externalId: `u${i}`,
    data: { text: `text ${i}`, group: i < 4 ? "a" : i < 8 ? "b" : "c" },
  })),
};
const setup = (patch: Partial<SetupAnswers>): SetupAnswers => ({
  ...DEFAULT_SETUP,
  name: "Pilot",
  units: setupUnits,
  layout: { body: ["text"] },
  questions: { before: [], unit: ["topic"], after: [] },
  ...patch,
});
/** The validation issues of a recipe's codebook, besides the questions to specify. */
const otherIssues = (a: SetupAnswers) => {
  const recipe = RecipeSchema.parse(setupRecipe(a));
  return validateDesignItems(designItems(recipe.design)).filter((i) => !i.message.includes("no answer type yet"));
};
const loopOf = (a: SetupAnswers) =>
  (setupRecipe(a).design.items as { type: string; units?: unknown; layout?: { template: string } }[]).find(
    (i) => i.type === "unit_loop",
  )!;

describe("setup wizard recipes", () => {
  it("turn typed lines into question names, keeping the text as the question", () => {
    expect(parseQuestions(["age", " How old are you? ", "", "Política"])).toEqual([
      { name: "age" },
      { name: "how_old_are_you", question: "How old are you?" },
      { name: "politica", question: "Política" },
    ]);
  });

  it("ask in one list, or before, per unit and after with annotation plus a survey", () => {
    expect(questionLists({ annotate: true, survey: false, experiment: false })).toEqual(["unit"]);
    expect(questionLists({ annotate: false, survey: true, experiment: false })).toEqual(["before"]);
    expect(questionLists({ annotate: false, survey: false, experiment: true })).toEqual(["before"]);
    expect(questionLists({ annotate: true, survey: false, experiment: true })).toEqual(["unit"]);
    expect(questionLists({ annotate: true, survey: true, experiment: false })).toEqual(["before", "unit", "after"]);
  });

  it("the title coders see goes into the design's public info, only when given", () => {
    expect(setupRecipe(setup({})).design.session).toEqual({});
    expect(setupRecipe(setup({ publicTitle: "  Reading the news " })).design.public).toEqual({
      title: "Reading the news",
    });
    const links = setup({
      publicTitle: "News",
      distribution: { mode: "sets", source: "column", sets: 0, column: "group", overlap: null },
    });
    expect(setupRecipe(links).design.session).toMatchObject({ invite: { mode: "coders", column: "coders" } });
    expect(setupRecipe(links).design.public).toEqual({ title: "News" });
  });

  it("everyone codes everything: a loop over all units, laid out as chosen", () => {
    const a = setup({ layout: { title: "group", body: ["text"] } });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    expect(loopOf(a)).toMatchObject({ layout: { template: "# $unit.group\n\n$unit.text" } });
    expect(loopOf(a).units).toBeUndefined();
    expect(setupRecipe(a).sets).toEqual([]);
  });

  it("assign sets: split over coders, with overlap, a link each", () => {
    const a = setup({
      distribution: {
        ...defaultDistribution("sets"),
        sets: 3,
        overlap: { by: "percent", value: 20 },
      } as SetupAnswers["distribution"],
    });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    const [group] = recipe.sets!;
    expect(group.group).toBe("coders");
    const sizes = Object.fromEntries(group.sets.map((s) => [s.name, s.units.length]));
    expect(sizes).toEqual({ coder_1: 3, coder_2: 3, coder_3: 2, _overlap: 2 });
    // Every unit once
    expect(new Set(group.sets.flatMap((s) => s.units)).size).toBe(10);
    // The sets are the coders, a link each; the overlap spread (the default)
    expect(setupRecipe(a).design.session).toEqual({
      invite: { mode: "coders", column: "coders", link: "per_coder" },
    });
    expect(loopOf(a).units).toBeUndefined();
  });

  it("assign sets by a column, a link per set", () => {
    const a = setup({
      distribution: { mode: "sets", source: "column", sets: 0, column: "group", overlap: null },
    });
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    expect(recipe.sets![0].sets.map((s) => [s.name, s.units.length])).toEqual([
      ["a", 4],
      ["b", 4],
      ["c", 2],
    ]);
    // The links: the sets are the coders, a link each
    expect(recipe.design.session).toEqual({ invite: { mode: "coders", column: "coders", link: "per_coder" } });
    expect(loopOf(a).units).toBeUndefined();
  });

  it("gold and practice checks on per-unit questions, with a sets column keeping _gold and _practice", () => {
    const a = setup({
      distribution: { mode: "sets", source: "column", sets: 0, column: "group", overlap: null },
    });
    const units = a.units!.units.map((u, i) =>
      i === 0
        ? { ...u, data: { ...u.data, group: "_gold" } }
        : i === 1
          ? { ...u, data: { ...u.data, group: "_practice" } }
          : u,
    );
    const recipe = setupRecipe({
      ...a,
      units: { ...a.units!, units },
      checks: { gold: ["topic"], practice: ["topic", "nope"] },
    });
    const names = recipe.sets![0].sets.map((s) => s.name);
    expect(names).toContain("_gold");
    expect(names).toContain("_practice");
    expect(
      loopOf({ ...a, units: { ...a.units!, units }, checks: { gold: ["topic"], practice: ["topic", "nope"] } }).units,
    ).toEqual({
      practice: "before",
      practiceCheck: { questions: ["topic"] },
      goldCheck: { questions: ["topic"] },
    });
  });

  it("crowd coding: until coders agree, with limits per coder and an overlap", () => {
    const a = setup({
      questions: { before: [], unit: ["sentiment", "topic"], after: [] },
      distribution: {
        mode: "crowd",
        shared: { until: { agree: 2, on: "sentiment" }, codersPerUnit: { max: 3 }, unitsPerCoder: { min: 2, max: 5 } },
        overlap: { by: "units", value: 2 },
      },
    });
    expect(setupProblems(a)).toEqual([]);
    // The agreement question needs a categorical type: reported until it is specified
    expect(otherIssues(a).map((i) => i.message)).toEqual([expect.stringContaining("sentiment")]);
    expect(setupRecipe(a).design.session).toEqual({
      invite: {
        mode: "crowd",
        units: { until: { agree: 2, on: "sentiment" }, codersPerUnit: { max: 3 }, unitsPerCoder: { min: 2, max: 5 } },
      },
    });
    expect(loopOf(a).units).toBeUndefined();
    // The overlap: everyone's, in a column of its own
    expect(setupRecipe(a).sets![0].sets.map((s) => [s.name, s.units.length])).toEqual([["_overlap", 2]]);
  });

  it("crowd coding without overlap: a queue over all units", () => {
    const a = setup({ distribution: { mode: "crowd", shared: { codersPerUnit: { min: 2, max: 2 } }, overlap: null } });
    expect(otherIssues(a)).toEqual([]);
    expect(setupRecipe(a).design.session).toEqual({
      invite: { mode: "crowd", units: { codersPerUnit: { min: 2, max: 2 } } },
    });
    expect(loopOf(a).units).toBeUndefined();
    expect(setupRecipe(a).sets).toEqual([]);
  });

  it("crowd coding with checks but no overlap: a queue over all units", () => {
    const a = setup({
      distribution: { mode: "crowd", shared: { codersPerUnit: { min: 2, max: 2 } }, overlap: null },
      checks: { gold: ["topic"], practice: [] },
    });
    // Gold units come from a set column's _gold (added on the Units page)
    expect(setupRecipe(a).sets).toEqual([]);
    expect(loopOf(a).units).toEqual({ goldCheck: { questions: ["topic"] } });
  });

  it("sets from a column: values with the same set name are one set; special units stay out of the overlap", () => {
    const names = ["a;b", "a#b", "_gold", "_gold", "_overlap", "c", "c", "c", "c", "c"];
    const units = {
      ...setupUnits,
      units: setupUnits.units.map((u, i) => ({ ...u, data: { ...u.data, group: names[i] } })),
    };
    const a = setup({
      units,
      distribution: {
        mode: "sets",
        source: "column",
        sets: 0,
        column: "group",
        overlap: { by: "units", value: 2 },
      },
    });
    const sets = Object.fromEntries(setupRecipe(a).sets![0].sets.map((s) => [s.name, s.units]));
    expect(Object.keys(sets).sort()).toEqual(["_gold", "_overlap", "a_b", "c"].sort());
    expect(sets._gold).toEqual(["u2", "u3"]);
    // The column's _overlap unit and the two drawn ones
    expect(sets._overlap).toHaveLength(3);
    expect(sets._overlap).toContain("u4");
    expect(sets._overlap).not.toContain("u2");
  });

  it("experimental groups, annotating only: the condition first (a computed item), linked to a set column with a value per condition", () => {
    const a = setup({
      parts: { annotate: true, survey: false, experiment: true },
      distribution: { mode: "groups", column: "group", values: { control: ["a"], treatment: ["b", "c"] } },
      questions: { before: [], unit: ["topic"], after: [] },
    });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    expect(recipe.sets![0].sets.map((s) => [s.name, s.units.length])).toEqual([
      ["control", 4],
      ["treatment", 6],
    ]);
    // The condition, then the loop
    expect((recipe.design.items as { type: string }[]).map((i) => i.type)).toEqual(["computed", "unit_loop"]);
    expect(recipe.design.items[0]).toMatchObject({
      variable: { type: "random", draw: "balanced", units: "condition" },
    });
    expect(recipe.design.session).toEqual({});
    expect(loopOf(a).units).toBeUndefined();
  });

  it("experimental groups with a survey: the condition first (a computed item), questions before and after", () => {
    const a = setup({
      parts: { annotate: true, survey: true, experiment: true },
      distribution: { mode: "groups", column: "group", values: { control: ["a"], treatment: ["b", "c"] } },
      questions: { before: ["age"], unit: ["topic"], after: ["Any comments?"] },
    });
    expect(setupProblems(a)).toEqual([]);
    expect(otherIssues(a)).toEqual([]);
    const recipe = setupRecipe(a);
    const items = recipe.design.items as { name?: string; type: string }[];
    expect(items.map((i) => i.name ?? i.type)).toEqual(["condition", "age", "unit_loop", "any_comments"]);
    // The condition selects its units: a computed item linked to a set column named after it
    expect(recipe.sets![0].group).toBe("condition");
    expect((recipe.design.items as { type: string; variable?: { units?: string } }[])[0]).toMatchObject({
      type: "computed",
      variable: { type: "random", units: "condition" },
    });
  });

  it("a survey alone, or an experiment alone (a survey with an experiment)", () => {
    const survey = setup({
      parts: { annotate: false, survey: true, experiment: false },
      units: null,
      questions: { before: ["age"], unit: [], after: [] },
    });
    expect(setupProblems(survey)).toEqual([]);
    expect(setupRecipe(survey).design.items).toEqual([
      { type: "question", name: "age", variable: { type: "unspecified" } },
    ]);
    const experiment = setup({
      parts: { annotate: false, survey: false, experiment: true },
      units: null,
      questions: { before: ["support"], unit: [], after: [] },
    });
    expect(otherIssues(experiment)).toEqual([]);
    expect(setupRecipe(experiment).design.items).toHaveLength(2);
  });

  it("say what is missing or wrong", () => {
    expect(
      setupProblems(
        setup({
          name: "",
          parts: { annotate: false, survey: false, experiment: false },
          questions: { before: [], unit: [], after: [] },
        }),
      ),
    ).toEqual([
      "Give the study a name",
      "Choose at least one of annotate, survey or experiment",
      "Add at least one question",
    ]);
    const twice = setup({
      parts: { annotate: true, survey: true, experiment: false },
      questions: { before: ["Age"], unit: ["age"], after: [] },
    });
    expect(setupProblems(twice)).toEqual(["Each question once: age"]);
    // The queue's own rules; the question to agree on can wait for the editor
    const crowd = setup({
      distribution: {
        mode: "crowd",
        shared: { until: { agree: 2, on: "" }, codersPerUnit: { max: 1 } },
        overlap: null,
      },
    });
    expect(setupProblems(crowd)).toEqual([expect.stringContaining("The most coders per unit must be at least")]);
    const groups = setup({
      parts: { annotate: true, survey: false, experiment: true },
      distribution: { mode: "groups", column: "group", values: { control: ["a"] } },
    });
    expect(setupProblems(groups)).toEqual(["Choose the units of treatment"]);
    expect(setupProblems(setup({ units: null, distribution: defaultDistribution("sets") }))).toEqual([
      "Assigning sets needs the units now",
    ]);
    // With units, something of each unit is shown
    expect(setupProblems(setup({ layout: { body: [] } }))).toEqual([
      "Choose what coders see of each unit (How coders see a unit)",
    ]);
  });
});
