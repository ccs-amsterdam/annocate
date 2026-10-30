import { expect, test, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import type { JobResponse } from "@annotinder/contracts";
import { answers, api, question } from "./helpers";

// The researcher UI, in a real browser (development login).

async function downloadZip(page: Page): Promise<Record<string, string>> {
  await page.getByRole("button", { name: "Results" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download zip/ }).click()]);
  const bytes = await (await download.createReadStream()).toArray();
  const files = unzipSync(new Uint8Array(Buffer.concat(bytes)));
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

const csvRows = (csv: string) => csv.replace(/^﻿/, "").trim().split(/\r?\n/);

test("a job from an example: the dialog, the overview note, and its results in the download", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create new job/ }).click();
  await page.getByRole("menuitem", { name: /From an example/ }).click();
  await page.getByRole("button", { name: /Sentiment by swiping/ }).click();
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByText(/Made from the example/)).toBeVisible();

  const files = await downloadZip(page);
  for (const name of ["README.txt", "annotations.csv", "coders.csv", "units.csv", "variables.csv", "devices.csv", "timings.csv", "deleted_coders.csv"]) {
    expect(Object.keys(files)).toContain(name);
  }
  // 3 example coders, 10 units each
  expect(csvRows(files["annotations.csv"])).toHaveLength(1 + 30);
  expect(csvRows(files["coders.csv"])).toHaveLength(1 + 3);
});

test("your first job, as the help describes it: units, a codebook, publish, invite, code", async ({ page, request, browser }) => {
  // 1. Create a job
  await page.goto("/");
  await page.getByRole("button", { name: /Create new job/ }).click();
  await page.getByRole("menuitem", { name: /Empty job/ }).click();
  await page.getByPlaceholder(/Sentiment Analysis/).fill("News pilot");
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  const job = (await api<JobResponse[]>(request, "GET", "/job")).find((j) => j.name === "News pilot")!;

  // 2. Upload the units
  await page.getByRole("button", { name: "Design", exact: true }).click();
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
  await expect.poll(async () => (await api<unknown[]>(request, "GET", `/job/${job.id}/units`)).length).toBe(3);

  // 3-6. A codebook (written through the API: the editor has its own unit tests), published
  const codebook = await api<{ id: number }>(request, "POST", `/job/${job.id}/codebook`, {
    note: "v1",
    items: [
      {
        type: "unit_loop",
        label: "News articles",
        units: [{ mode: "all" }],
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
  await page.getByRole("button", { name: "Codebook", exact: true }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: /Publish v1/ }).click();
  await expect.poll(async () => (await api<{ codebookId: number } | null>(request, "GET", `/job/${job.id}/deployment`))?.codebookId).toBe(codebook.id);

  // 7. Invite coders: publishing made the job's link; give it a label
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await page.getByRole("button", { name: "Invitations", exact: true }).click();
  await expect(page.getByText("Open link")).toBeVisible();
  await page.getByRole("button", { name: "Who may use this link" }).click();
  await page.getByLabel("Label").fill("Pilot coders");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Pilot coders")).toBeVisible();
  const [invite] = await api<{ secret: string }[]>(request, "GET", `/job/${job.id}/invites`);

  // A coder codes the three articles
  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/?deployment=${job.id}&invite=${invite.secret}`);
  for (const topic of ["Disasters", "Politics", "Sports"]) {
    await question(coder, "What is this article mainly about?");
    await coder.getByRole("button", { name: new RegExp(topic) }).click();
  }
  await expect(coder.getByText(/completed|Thank you/i).first()).toBeVisible();
  await expect.poll(async () => (await answers(request, job.id)).length).toBe(3);

  // 8. The download has them
  const files = await downloadZip(page);
  expect(csvRows(files["annotations.csv"])).toHaveLength(1 + 3);
});
