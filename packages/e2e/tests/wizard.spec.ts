import { expect, test } from "@playwright/test";
import type { CodebookResponse, JobResponse, SetGroupResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// The setup wizard (docs/plans/setup-wizard.md): through its steps to a job
// with a draft codebook, opened in the editor to specify the questions.

test("annotation with an experiment: a set of units per condition, questions before, per unit and after", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create new job/ }).click();
  await page.getByRole("menuitem", { name: /Guided setup/ }).click();
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
  await page.getByRole("button", { name: "Next" }).click();

  // Who codes what: the experimental groups, by the values of group
  await page.getByLabel("Who codes which units").selectOption({ label: "Experimental groups" });
  await page.getByLabel("Column for the groups").selectOption("group");
  await page.getByRole("group", { name: "control" }).getByRole("checkbox", { name: "control" }).check();
  await page.getByRole("group", { name: "treatment" }).getByRole("checkbox", { name: "treatment" }).check();
  await page.getByRole("button", { name: "Next" }).click();

  // How coders see a unit: the text as body, group not shown (the preview shows the first unit)
  await page.getByRole("button", { name: "Body: group" }).hover();
  await page.getByRole("button", { name: "Remove group from the body" }).click();
  await expect(page.getByText("A neutral report.")).toBeVisible();
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
  const [group] = await api<SetGroupResponse[]>(request, "GET", `/job/${job.id}/sets`);
  expect(group.sets.map((s) => [s.name, s.unitIds.length])).toEqual([
    ["control", 1],
    ["treatment", 2],
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
  await page.getByRole("button", { name: /Create new job/ }).click();
  await page.getByRole("menuitem", { name: /Guided setup/ }).click();
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
  // A draft: its link comes when it is published
  expect((await api<unknown[]>(request, "GET", `/job/${job.id}/invites`)).length).toBe(0);
});

test("crowd coding with an overlap; the loop's units are set by the wizard", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create new job/ }).click();
  await page.getByRole("menuitem", { name: /Guided setup/ }).click();
  await page.getByLabel("Job name").fill("Crowd pilot");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "units.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,headline,text\n" + Array.from({ length: 10 }, (_, i) => `u${i},Headline ${i},Text ${i}`).join("\n") + "\n"),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Crowd coding, with the editor's form: 2 coders per unit
  await page.getByLabel("Who codes which units").selectOption({ label: "Crowd coding" });
  await page.getByLabel("Coders per unit", { exact: true }).fill("2");
  await page.getByRole("checkbox", { name: /Overlap/ }).check();
  await page.getByLabel("Overlap in").selectOption("units");
  await page.getByLabel("Overlap size").fill("2");
  await page.getByRole("button", { name: "Next" }).click();
  // The headline was guessed as the title
  await expect(page.getByRole("button", { name: "Title: headline" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Questions about each unit").fill("sentiment");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByText("to specify")).toHaveCount(1);

  const job = (await api<JobResponse[]>(request, "GET", "/job")).find((j) => j.name === "Crowd pilot")!;
  const [draft] = await api<CodebookResponse[]>(request, "GET", `/job/${job.id}/codebook`);
  const [loop] = (await api<CodebookResponse>(request, "GET", `/job/${job.id}/codebook/${draft.id}`)).items as { units: unknown[]; layout: { template: string } }[];
  expect(loop.units).toEqual([
    { mode: "shared", set: { group: "sets", set: "queue" }, until: { coders: 2 }, maxCoders: 2, overlap: { placement: "first" } },
  ]);
  expect(loop.layout.template).toBe("# $unit.headline\n\n$unit.text");
  const [group] = await api<SetGroupResponse[]>(request, "GET", `/job/${job.id}/sets`);
  expect(group.sets.map((s) => [s.name, s.unitIds.length])).toEqual([
    ["_overlap", 2],
    ["queue", 8],
  ]);
});
