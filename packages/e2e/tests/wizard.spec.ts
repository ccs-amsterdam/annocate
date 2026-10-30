import { expect, test } from "@playwright/test";
import type { CodebookResponse, JobResponse, UnitsetResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// The setup wizard (docs/plans/setup-wizard.md): through its steps to a job
// with a draft codebook, opened in the editor to specify the questions.

test("annotation with an experiment: a set of units per condition, questions before, per unit and after", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Guided setup" }).click();
  await page.getByLabel("Job name").fill("Framing study");
  // Annotate is on; add the experiment
  await page.getByRole("button", { name: /Experiment/ }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // The experiment: the default conditions, balanced
  await expect(page.getByLabel("Conditions (one per line)")).toHaveValue("control\ntreatment");
  await page.getByRole("button", { name: "Next" }).click();

  // Units, with the condition in a column
  await page.locator("input[type=file]").setInputFiles({
    name: "stimuli.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,text,group\ns1,A neutral report.,control\ns2,A framed report.,treatment\ns3,Another framed one.,treatment\n"),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByRole("radio", { name: /A set of units per condition/ }).check();
  await page.getByLabel("Field with the condition").selectOption("group");
  // The condition's field is no longer shown to coders
  await expect(page.getByRole("checkbox", { name: /group/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Next" }).click();

  // Question names in three places
  await page.getByLabel("Questions before the units").fill("age");
  await page.getByLabel("Questions about each unit").fill("How credible is it?\ntopic");
  await page.getByLabel("Questions after the units").fill("comments");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("3 units, showing text.")).toBeVisible();
  await page.getByRole("button", { name: "Create job" }).click();

  // The editor, with the questions to specify
  await expect(page.getByText("to specify")).toHaveCount(4);
  const job = (await api<JobResponse[]>(request, "GET", "/job")).find((j) => j.name === "Framing study")!;
  const sets = await api<UnitsetResponse[]>(request, "GET", `/job/${job.id}/unitsets`);
  expect(sets.map((s) => [s.name, s.unitIds.length])).toEqual([
    ["condition_control", 1],
    ["condition_treatment", 2],
  ]);
  const [draft] = await api<CodebookResponse[]>(request, "GET", `/job/${job.id}/codebook`);
  const items = (await api<CodebookResponse>(request, "GET", `/job/${job.id}/codebook/${draft.id}`)).items as {
    name?: string;
    type: string;
    variable?: { type: string; question?: string };
    children?: { name: string; variable: { type: string; question?: string } }[];
  }[];
  expect(items.map((i) => i.name ?? i.type)).toEqual(["condition", "age", "unit_loop", "comments"]);
  expect(items[2].children!.map((c) => [c.name, c.variable])).toEqual([
    ["how_credible_is_it", { type: "unspecified", question: "How credible is it?" }],
    ["topic", { type: "unspecified" }],
  ]);

  // Specifying one: choose its answer type
  await page.getByText("age", { exact: true }).first().click();
  await page.locator("select").filter({ hasText: "Choose an answer type" }).selectOption("numeric");
  await expect(page.getByText("to specify")).toHaveCount(3);
});

test("a survey alone: questions by name, no units", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Guided setup" }).click();
  await page.getByLabel("Job name").fill("Opinion survey");
  await page.getByRole("button", { name: /Annotate units/ }).click();
  await page.getByRole("button", { name: /Ask questions/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Questions").fill("age\nDo you trust the news?");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByText("to specify")).toHaveCount(2);
  const job = (await api<JobResponse[]>(request, "GET", "/job")).find((j) => j.name === "Opinion survey")!;
  expect(await api<unknown[]>(request, "GET", `/job/${job.id}/units`)).toEqual([]);
  expect((await api<unknown[]>(request, "GET", `/job/${job.id}/invites`)).length).toBe(1);
});
