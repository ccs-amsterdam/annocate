import { expect, test } from "./fixtures";
import type { DesignVersion, StudyResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// The design editor, step by step as "Your first study" (help) describes it.

test("writing a design in the editor, as the help describes it, and saving it", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Editor test" });
  await api(request, "POST", `/study/${study.id}/units`, {
    units: [{ externalId: "a1", data: { headline: "Storm hits the coast", text: "Heavy rain." } }],
  });
  await page.goto("/research");
  await page.getByText("Editor test").click();
  await page.getByRole("button", { name: "Design", exact: true }).click();

  // A unit loop
  // (Form labels aren't tied to their fields yet: placeholders find them.)
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: /^Unit loop/ }).click();
  await page.getByPlaceholder("e.g. News items").fill("News articles");
  // A new loop hands out all the session's units, once: nothing to specify
  await expect(page.getByText("to specify")).toHaveCount(0);

  // A new loop starts with its unit layout (the first item in it)
  await expect(page.getByRole("button", { name: "Unit layout" })).toBeVisible();
  // The first question, after the layout: the layout row's "+", then where, then what
  // (the session parameters are above the tree, not a row: the loop is the first row)
  await page.getByRole("button", { name: "Add an item below" }).nth(1).click();
  await page.getByRole("button", { name: "After Unit layout" }).click();
  await page
    .getByRole("button", { name: /^Question/ })
    .first()
    .click();
  await page.getByPlaceholder("e.g. sentiment, age").fill("topic");
  // A new question has no answer type yet: the form starts with the answer types as cards
  await expect(page.getByText("Choose an answer type")).toBeVisible();
  await page.getByRole("option", { name: /^Categories/ }).click();
  await expect(page.getByRole("button", { name: "Change type" })).toBeVisible();
  await page.getByPlaceholder(/The question coders see/).fill("What is this article mainly about?");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await api<DesignVersion[]>(request, "GET", `/study/${study.id}/design`)).length, {
      timeout: 10_000,
    })
    .toBe(1);
  const [saved] = await api<{ id: number }[]>(request, "GET", `/study/${study.id}/design`);
  const { items } = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${saved.id}`);
  expect(items).toMatchObject([
    {
      type: "unit_loop",
      label: "News articles",
      children: [
        { type: "layout", template: "" },
        { name: "topic", variable: { type: "nominal", question: "What is this article mainly about?" } },
      ],
    },
  ]);
});

test("an experiment: balanced conditions, each with its own units (condition_set)", async ({ page, request }) => {
  // (No "Experiment" in the name: the setup wizard's tests look for an Experiment button on the studies page)
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Conditions in the editor" });
  const units = await api<{ id: number; externalId: string }[]>(request, "POST", `/study/${study.id}/units`, {
    units: [
      { externalId: "u1", data: { text: "One" } },
      { externalId: "u2", data: { text: "Two" } },
    ],
  });
  await api(request, "PUT", `/study/${study.id}/sets/condition_set`, {
    sets: [
      { name: "control", unitIds: [units[0].id] },
      { name: "experiment", unitIds: [units[1].id] },
    ],
  });
  await page.goto("/research");
  await page.getByText("Conditions in the editor").click();
  await page.getByRole("button", { name: "Design", exact: true }).click();

  // An experiment at the top level
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: /^Experiment/ }).click();
  await page.getByPlaceholder("e.g. sentiment, age").fill("framing");
  await expect(page.getByText("never shown to the coder")).toBeVisible();
  await page.getByLabel("Assigned").selectOption("balanced");
  await page.getByRole("checkbox", { name: /Each condition gets its own units/ }).check();
  await expect(page.getByText("condition_set has control (1), experiment (1).")).toBeVisible();
  await page.getByRole("checkbox", { name: /The conditions are condition_set's values/ }).check();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await api<DesignVersion[]>(request, "GET", `/study/${study.id}/design`)).length, {
      timeout: 10_000,
    })
    .toBe(1);
  const [saved] = await api<{ id: number }[]>(request, "GET", `/study/${study.id}/design`);
  const { items } = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${saved.id}`);
  expect(items).toMatchObject([
    { type: "experiment", name: "framing", variable: { type: "random", draw: "balanced", units: true } },
  ]);
  expect((items[0] as { variable: { options?: unknown } }).variable.options).toBeUndefined();
});

test("blocks: a label and a condition, else items; questions and loops at the top level; the study's end", async ({
  page,
  request,
}) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Blocks test" });
  await page.goto(`/research/studies/${study.id}/design`);

  // A question at the top level, then a unit loop: no end item there (they go in a block)
  await page.getByRole("button", { name: /Add item/ }).click();
  await expect(page.getByRole("button", { name: /^End/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Question\b/ }).click();
  await page.getByPlaceholder("e.g. sentiment, age").fill("age");
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: "At the end", exact: true }).first().click();
  await page.getByRole("button", { name: /^Unit loop/ }).click();

  // A block after the loop, with a label and a condition (a new block starts empty)
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: "At the end", exact: true }).first().click();
  await page.getByRole("button", { name: /^Block/ }).click();
  await page.getByPlaceholder("e.g. Demographics").fill("Adults");
  await page.getByRole("checkbox", { name: /Only show these questions if/ }).check();
  // Else items: begun from the block's row, with the usual menu (its header says what it adds)
  await page.getByRole("button", { name: /Add else items/ }).click();
  await expect(page.getByText("If not, then…")).toBeVisible();
  await page.getByRole("button", { name: /^Question/ }).click();
  await page.getByPlaceholder("e.g. sentiment, age").fill("guardian");
  await expect(page.getByText("Else", { exact: true })).toBeVisible();

  // The study's normal end: a button below the tree, with a message
  await page
    .getByRole("button", { name: /At the end/ })
    .last()
    .click();
  await page.getByPlaceholder("Thank you for your time.").fill("Thanks for coding!");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await api<DesignVersion[]>(request, "GET", `/study/${study.id}/design`)).length, {
      timeout: 10_000,
    })
    .toBe(1);
  const [saved] = await api<{ id: number }[]>(request, "GET", `/study/${study.id}/design`);
  const version = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${saved.id}`);
  expect(version.session).toMatchObject({ end: { message: "Thanks for coding!" } });
  expect(version.items).toMatchObject([
    { type: "question", name: "age" },
    { type: "unit_loop" },
    { type: "block", label: "Adults", condition: { script: "true" }, elseChildren: [{ name: "guardian" }] },
  ]);
});

test("a deployed answer value stays when its label is edited; a new option's value follows its label", async ({
  page,
  request,
}) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Deployed values" });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    items: [
      {
        type: "question",
        name: "tone",
        variable: { type: "nominal", question: "Tone?", options: [{ value: "positive", label: "Positive" }] },
      },
    ],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^tone/ }).click();
  const labels = page.getByPlaceholder("label", { exact: true });
  const values = page.getByPlaceholder("value", { exact: true });
  // Deployed: coders may have answered "positive", so the value stays
  await page.getByPlaceholder("positive", { exact: true }).fill("Very positive");
  await expect(values.first()).toHaveValue("positive");
  // A new option: its value follows its label
  await page.getByRole("button", { name: /Add option/ }).click();
  await labels.last().fill("Neutral tone");
  await expect(values.last()).toHaveValue("neutral_tone");
});

test("an answer option's colour: from the palette, or none", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Option colours" });
  await api(request, "POST", `/study/${study.id}/design`, {
    items: [
      {
        type: "question",
        name: "tone",
        variable: { type: "nominal", question: "Tone?", options: [{ value: "positive", label: "Positive" }] },
      },
    ],
  });
  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^tone/ }).click();
  await page.getByRole("button", { name: "Colour of Positive: none" }).click();
  await page.getByRole("button", { name: "#22c55e" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Colour of Positive: #22c55e" })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => {
      const [saved] = await api<{ id: number }[]>(request, "GET", `/study/${study.id}/design`);
      const version = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${saved.id}`);
      return JSON.stringify(version.items);
    })
    .toContain('"color":"#22c55e"');
});
