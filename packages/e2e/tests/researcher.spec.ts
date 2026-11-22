import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { unzipSync, strFromU8 } from "fflate";
import type { StudyResponse } from "@annotinder/contracts";
import { answers, api, fromExample, question } from "./helpers";

// The researcher UI, in a real browser (development login).

async function downloadZip(page: Page, format: "CSV" | "Excel (.xlsx)" = "CSV"): Promise<Record<string, string>> {
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.getByRole("tab", { name: "Download" }).click();
  await page.getByLabel(format).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const bytes = await (await download.createReadStream()).toArray();
  const files = unzipSync(new Uint8Array(Buffer.concat(bytes)));
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

const csvRows = (csv: string) => csv.replace(/^﻿/, "").trim().split(/\r?\n/);

test("a study from an example: the dialog, the overview note, and its results in the download", async ({ page }) => {
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /From an example/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Sentiment by swiping/ })
    .click();
  await page.getByRole("button", { name: "Create study" }).click();
  await expect(page.getByText(/Made from the example/)).toBeVisible();

  const files = await downloadZip(page);
  for (const name of [
    "README.txt",
    "annotations.csv",
    "coders.csv",
    "units.csv",
    "variables.csv",
    "devices.csv",
    "timings.csv",
    "deleted_coders.csv",
  ]) {
    expect(Object.keys(files)).toContain(name);
  }
  // 3 example coders, 10 units each
  expect(csvRows(files["annotations.csv"])).toHaveLength(1 + 30);
  expect(csvRows(files["coders.csv"])).toHaveLength(1 + 3);

  // For spreadsheets: one workbook, a sheet per table
  const workbook = await downloadZip(page, "Excel (.xlsx)");
  expect(Object.keys(workbook)).toContain("results.xlsx");
  expect(Object.keys(workbook)).not.toContain("annotations.csv");

  // The raw export, as the server keeps it: JSON lines and a manifest (under the download settings)
  await page.getByText("Download settings").click();
  const [raw] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Raw export", exact: true }).click(),
  ]);
  const rawFiles = unzipSync(new Uint8Array(Buffer.concat(await (await raw.createReadStream()).toArray())));
  const manifest = JSON.parse(strFromU8(rawFiles["manifest.json"])) as { counts: Record<string, number> };
  expect(manifest.counts["answers.jsonl"]).toBe(30);
  expect(raw.suggestedFilename()).toMatch(/_results_.*\.zip$/);
});

test("results so far: answers per question, and agreement with each coder's", async ({ page, request }) => {
  const { study } = await fromExample(request, "swipe-sentiment");
  await page.goto(`/research/studies/${study.id}/results`);
  await page.getByRole("tab", { name: "Questions" }).click();
  // The design's labels, and the counts of the 3 example coders' 30 answers
  await expect(page.getByText("30 answered")).toBeVisible();
  await expect(page.getByText("Good news", { exact: true })).toBeVisible();
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/results-questions.png`, fullPage: true });

  await page.getByRole("tab", { name: "Agreement" }).click();
  await expect(page.getByRole("cell", { name: "0.61" })).toBeVisible();
  await page.getByRole("button", { name: /sentiment/ }).click();
  await expect(page.getByRole("cell", { name: "Example coder 2", exact: true })).toBeVisible();
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/results-agreement.png`, fullPage: true });

  // Units several coders answered, most disagreement first; one with each coder's answer
  await page.getByRole("tab", { name: "Units" }).click();
  await page.locator("tbody button").first().click();
  await expect(page.getByRole("button", { name: "Back to the units" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Example coder 3", exact: true })).toBeVisible();
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/results-unit.png`, fullPage: true });

  await page.getByRole("tab", { name: "Coders" }).click();
  await expect(page.getByRole("columnheader", { name: "Seconds per unit" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Example coder 1", exact: true })).toBeVisible();
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/results-coders.png`, fullPage: true });
});

test("your first study, as the help describes it: units, a design, deploy, a link, code", async ({
  page,
  request,
  browser,
}) => {
  // 1. Create a study
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /Empty study/ }).click();
  await page.getByPlaceholder(/Sentiment Analysis/).fill("News pilot");
  await page.getByRole("button", { name: "Create Study" }).click();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  const study = (await api<StudyResponse[]>(request, "GET", "/study")).find((j) => j.name === "News pilot")!;

  // 2. Upload the units
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "articles.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "id,headline,text\n" +
        "a1,Storm hits the coast,Heavy rain caused flooding in several towns.\n" +
        "a2,Minister resigns,The minister stepped down after a dispute.\n" +
        "a3,Local team wins cup,The final ended 2-1 after extra time.\n",
    ),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByRole("button", { name: /Upload 3 units/ }).click();
  await expect.poll(async () => (await api<unknown[]>(request, "GET", `/study/${study.id}/units`)).length).toBe(3);

  // 3-6. A design (written through the API: the editor has its own unit tests), published
  const codebook = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    note: "v1",
    items: [
      {
        type: "unit_loop",
        label: "News articles",
        layout: { template: "# $unit.headline\n\n$unit.text" },
        children: [
          {
            type: "question",
            name: "topic",
            variable: {
              type: "nominal",
              question: "What is this article mainly about?",
              options: [
                { value: "politics", label: "Politics" },
                { value: "disasters", label: "Disasters" },
                { value: "sports", label: "Sports" },
              ],
            },
          },
        ],
      },
    ],
  });
  await page.getByRole("navigation", { name: "Study" }).getByRole("button", { name: "Deploy", exact: true }).click();
  // The design written through the API (after the upload's v1) is offered
  await expect(page.getByLabel("Design v2")).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Deploy", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api<{ designVersionId: number } | null>(request, "GET", `/study/${study.id}/deployment`))
          ?.designVersionId,
    )
    .toBe(codebook.id);

  // 7. Link coders: deploying made the study's link
  await page.getByRole("button", { name: "Links", exact: true }).click();
  await expect(page.getByText("Open link")).toBeVisible();
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);

  // A coder codes the three articles
  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/code/${study.id}?link=${link.secret}`);
  for (const topic of ["Disasters", "Politics", "Sports"]) {
    await question(coder, "What is this article mainly about?");
    await coder.getByRole("button", { name: new RegExp(topic) }).click();
  }
  await expect(coder.getByText(/completed|Thank you/i).first()).toBeVisible();
  await expect.poll(async () => (await answers(request, study.id)).length).toBe(3);

  // 8. The download has them
  const files = await downloadZip(page);
  expect(csvRows(files["annotations.csv"])).toHaveLength(1 + 3);
});
