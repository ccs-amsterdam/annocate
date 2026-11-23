import { expect, test } from "./fixtures";
import type { DesignVersion, StudyResponse, SetGroupResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// The setup wizard (docs/examples.md): through its steps to a study
// with a draft design version, opened in the editor to specify the questions.

test("annotation with questions and an experiment: a set of units per condition, questions before, per unit and after", async ({
  page,
  request,
}) => {
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /Guided setup/ }).click();
  await page.getByLabel("Study name").fill("Framing study");
  // Annotate is on; add questions and the experiment (with questions, the condition is an experiment before them)
  await page.getByRole("button", { name: /Ask questions/ }).click();
  await page.getByRole("button", { name: /Experiment/ }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // The experiment: the default conditions, balanced
  await expect(page.getByLabel("Conditions (one per line)")).toHaveValue("control\ntreatment");
  await page.getByRole("button", { name: "Next" }).click();

  // Units, with the condition in a column
  await page.locator("input[type=file]").setInputFiles({
    name: "stimuli.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "id,text,group\ns1,A neutral report.,control\ns2,A framed report.,treatment\ns3,Another framed one.,treatment\n",
    ),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Who codes what: the experimental groups, by the values of group
  await page.getByLabel("Who codes which units").selectOption({ label: "Experimental groups" });
  await page.getByLabel("Column for the groups").selectOption("group");
  await page.getByRole("group", { name: "control" }).getByRole("checkbox", { name: "control" }).check();
  await page.getByRole("group", { name: "treatment" }).getByRole("checkbox", { name: "treatment" }).check();
  await page.getByRole("button", { name: "Next" }).click();

  // How coders see a unit: an empty sketch; the text as body (a click on the field), group not shown
  await expect(page.getByRole("button", { name: "Body: choose a field" })).toBeVisible();
  await page.getByRole("button", { name: "Add text to the body" }).click();
  await expect(page.getByRole("button", { name: "Body: text" })).toBeVisible();
  await expect(page.getByText("A neutral report.")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  // Question names in three places
  await page.getByLabel("Questions before the units").fill("age");
  await page.getByLabel("Questions about each unit").fill("How credible is it?\ntopic");
  await page.getByLabel("Questions after the units").fill("comments");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("3 units, showing text.")).toBeVisible();
  await page.getByRole("button", { name: "Create study" }).click();

  // The editor, with the questions to specify
  await expect(page.getByText("to specify")).toHaveCount(4);
  const study = (await api<StudyResponse[]>(request, "GET", "/study")).find((j) => j.name === "Framing study")!;
  const groups = await api<SetGroupResponse[]>(request, "GET", `/study/${study.id}/sets`);
  // The units of each condition: condition_set
  expect(groups.map((g) => g.name)).toEqual(["condition_set"]);
  expect(groups[0].sets.map((s) => [s.name, s.unitIds.length])).toEqual([
    ["control", 1],
    ["treatment", 2],
  ]);
  const [draft] = await api<DesignVersion[]>(request, "GET", `/study/${study.id}/design`);
  const items = (await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${draft.id}`)).items as {
    name?: string;
    type: string;
    variable?: { type: string; question?: string };
    children?: { name: string; variable: { type: string; question?: string } }[];
  }[];
  expect(items.map((i) => i.name ?? i.type)).toEqual(["condition", "age", "unit_loop", "comments"]);
  // The experimental groups: an experiment (a random condition) that selects units (condition_set)
  expect(items[0]).toMatchObject({
    type: "experiment",
    variable: { type: "random", draw: "balanced", units: true },
  });
  // After the loop's layout item
  expect(items[2].children!.slice(1).map((c) => [c.name, c.variable])).toEqual([
    ["how_credible_is_it", { type: "unspecified", question: "How credible is it?" }],
    ["topic", { type: "unspecified" }],
  ]);

  // Specifying one: choose its answer type
  await page.getByText("age", { exact: true }).first().click();
  await page.getByRole("option", { name: /^Number/ }).click();
  await expect(page.getByText("to specify")).toHaveCount(3);
});

test("a survey alone: questions by name, no units", async ({ page, request }) => {
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /Guided setup/ }).click();
  await page.getByLabel("Study name").fill("Opinion survey");
  await page.getByRole("button", { name: /Annotate units/ }).click();
  await page.getByRole("button", { name: /Ask questions/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Questions").fill("age\nDo you trust the news?");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create study" }).click();
  await expect(page.getByText("to specify")).toHaveCount(2);
  const study = (await api<StudyResponse[]>(request, "GET", "/study")).find((j) => j.name === "Opinion survey")!;
  expect(await api<unknown[]>(request, "GET", `/study/${study.id}/units`)).toEqual([]);
  // A draft: its link comes when it is published
  expect((await api<unknown[]>(request, "GET", `/study/${study.id}/links`)).length).toBe(0);
});

test("crowd coding with overlap units (a count); the invitation and the loop's checks are set by the wizard", async ({
  page,
  request,
}) => {
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /Guided setup/ }).click();
  await page.getByLabel("Study name").fill("Crowd pilot");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "units.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "id,headline,text\n" + Array.from({ length: 10 }, (_, i) => `u${i},Headline ${i},Text ${i}`).join("\n") + "\n",
    ),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Crowd coding, with the editor's form: 2 coders per unit
  await page.getByLabel("Who codes which units").selectOption({ label: "Crowd coding" });
  await page.getByLabel("Coders per unit", { exact: true }).fill("2");
  await page.getByRole("checkbox", { name: /Overlap/ }).check();
  await page.getByLabel("Overlap size").fill("2");
  await page.getByRole("button", { name: "Next" }).click();
  // The headline dragged to the title; the text chosen for the body from its menu
  await page
    .getByRole("button", { name: "Add headline to the body" })
    .dragTo(page.getByRole("button", { name: "Title: choose a field" }));
  await expect(page.getByRole("button", { name: "Title: headline" })).toBeVisible();
  await page.getByRole("button", { name: "Body: choose a field" }).click();
  await page.getByRole("menuitem", { name: "text" }).click();
  await expect(page.getByRole("button", { name: "Body: text" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Questions about each unit").fill("sentiment");
  // Gold units check the question silently; the units have no answer column yet
  await page.getByLabel("gold sentiment").check();
  await expect(page.getByText("no answer_sentiment yet")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create study" }).click();
  // The study's page opens once it is created
  await expect(page).toHaveURL(/\/research\/studies\/\d+\//);

  const study = (await api<StudyResponse[]>(request, "GET", "/study")).find((j) => j.name === "Crowd pilot")!;
  const [draft] = await api<DesignVersion[]>(request, "GET", `/study/${study.id}/design`);
  const version = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${draft.id}`);
  const [loop] = version.items as { units: unknown; children: { type: string; template?: string }[] }[];
  // The loop divides its units among the crowd; the overlap and gold units (test_set's) are spread (the default)
  expect(version.session).toEqual({ invite: { mode: "crowd" } });
  expect(loop.units).toEqual({
    divide: { codersPerUnit: { min: 2, max: 2 } },
    goldCheck: { questions: ["sentiment"] },
  });
  expect(loop.children[0]).toEqual({ type: "layout", template: "# $unit.headline\n\n$unit.text" });
  const groups = await api<SetGroupResponse[]>(request, "GET", `/study/${study.id}/sets`);
  // The overlap: a number of test units, everyone's (the queue is all units)
  expect(groups.map((g) => [g.name, g.sets.map((s) => [s.name, s.unitIds.length])])).toEqual([
    ["test_set", [["overlap", 2]]],
  ]);
});
