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
  await page.getByRole("button", { name: /Open the editor/ }).click();

  // A unit loop
  // (Form labels aren't tied to their fields yet: placeholders find them.)
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: /^Unit loop/ }).click();
  await page.getByPlaceholder("e.g. News items").fill("News articles");
  // A new loop hands out all the session's units, once: nothing to specify
  await expect(page.getByText("to specify")).toHaveCount(0);

  // The first question, inside the loop: the row's "+", then where, then what
  // (the session parameters are above the tree, not a row: the loop is the first row)
  await page.getByRole("button", { name: "Add an item below" }).first().click();
  await page.getByRole("button", { name: "Inside News articles" }).click();
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
      children: [{ name: "topic", variable: { type: "nominal", question: "What is this article mainly about?" } }],
    },
  ]);
});

test("a computed variable: a random condition linked to a set column", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Computed test" });
  const units = await api<{ id: number; externalId: string }[]>(request, "POST", `/study/${study.id}/units`, {
    units: [
      { externalId: "u1", data: { text: "One" } },
      { externalId: "u2", data: { text: "Two" } },
    ],
  });
  await api(request, "PUT", `/study/${study.id}/sets/framing`, {
    sets: [
      { name: "control", unitIds: [units[0].id] },
      { name: "experiment", unitIds: [units[1].id] },
    ],
  });
  await page.goto("/research");
  await page.getByText("Computed test").click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: /Open the editor/ }).click();

  // Computed items are part of an experiment: offered once it is on
  await page.getByRole("button", { name: /Add item/ }).click();
  await expect(page.getByRole("button", { name: /^Computed variable/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByLabel("What the design uses").getByRole("checkbox", { name: "Experiment" }).check();
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: /^Computed variable/ }).click();
  await page.getByPlaceholder("e.g. sentiment, age").fill("framing");
  await expect(page.getByText("Random condition", { exact: true })).toBeVisible();
  await expect(page.getByText("never shown to the coder")).toBeVisible();
  await page.locator("select").filter({ hasText: "Not linked to units" }).selectOption("framing");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await api<DesignVersion[]>(request, "GET", `/study/${study.id}/design`)).length, {
      timeout: 10_000,
    })
    .toBe(1);
  const [saved] = await api<{ id: number }[]>(request, "GET", `/study/${study.id}/design`);
  const { items } = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${saved.id}`);
  expect(items).toMatchObject([{ type: "computed", name: "framing", variable: { type: "random", units: "framing" } }]);
});

test("editor modes: annotating only shows one loop's items; a choice the design blocks says why; the study's end", async ({
  page,
  request,
}) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Modes test" });
  await page.goto(`/research/studies/${study.id}/editor`);
  const bar = page.getByLabel("What the design uses");
  // A new design: everything shown
  await expect(bar.getByRole("radio", { name: "Both" })).toHaveAttribute("aria-checked", "true");

  // Annotating only: the editor adds the loop, shown as "Units", its items as the top level
  await bar.getByRole("radio", { name: "Annotate units" }).click();
  await expect(page.getByRole("button", { name: /Units/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Add item/ }).click();
  await expect(page.getByRole("button", { name: /^Unit loop/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Computed variable/ })).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Question/ })
    .first()
    .click();
  await page.getByPlaceholder("e.g. sentiment, age").fill("topic");

  // Questions only would hide the loop: blocked, saying why
  const questions = bar.getByRole("radio", { name: "Questions" });
  await expect(questions).toBeDisabled();
  await expect(questions).toHaveAttribute("title", /unit loop/);

  // The study's normal end: its own row, with a message
  await page.getByRole("button", { name: /At the end/ }).click();
  await page.getByPlaceholder("Thank you for your time.").fill("Thanks for coding!");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await api<DesignVersion[]>(request, "GET", `/study/${study.id}/design`)).length, {
      timeout: 10_000,
    })
    .toBe(1);
  const [saved] = await api<{ id: number }[]>(request, "GET", `/study/${study.id}/design`);
  const version = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${saved.id}`);
  expect(version.session).toMatchObject({
    uses: { content: "annotate", experiment: false },
    end: { message: "Thanks for coding!" },
  });
  expect(version.items).toMatchObject([{ type: "unit_loop", children: [{ name: "topic" }] }]);
});

test("a design with questions only has no Units page", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Survey only" });
  await api(request, "POST", `/study/${study.id}/design`, {
    session: { params: [], uses: { content: "questions", experiment: false } },
    items: [{ type: "question", name: "age", variable: { type: "numeric", question: "Age?" } }],
  });
  await page.goto(`/research/studies/${study.id}/editor`);
  await expect(page.getByLabel("What the design uses").getByRole("radio", { name: "Questions" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("button", { name: "Editor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Units", exact: true })).toHaveCount(0);
});
