import { expect, test } from "./fixtures";
import type { JobResponse } from "@annotinder/contracts";
import { api, question } from "./helpers";

// Practice and gold units (docs/plans/special-sets.md): a practice unit
// tells the coder when they were wrong; a gold unit is checked silently, and
// running out of health ends the session at a screen-out.

test("a practice unit gives feedback when wrong; a wrong gold unit ends the session at a screen-out", async ({ page, request, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create new job/ }).click();
  await page.getByRole("menuitem", { name: /Empty job/ }).click();
  await page.getByPlaceholder(/Sentiment Analysis/).fill("Checked coders");
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  const job = (await api<JobResponse[]>(request, "GET", "/job")).find((j) => j.name === "Checked coders")!;

  // Units with a sets column and answer columns
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "units.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "id,text,part,topic_practice,topic_practice_message,topic_gold\n" +
        "p1,Practice text,_practice,politics,It is about an election.,\n" +
        "p2,Second practice,_practice,politics|other,,\n" +
        "u1,Own text,s1,,,\n" +
        "g1,Gold text,_gold,,,politics\n",
    ),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByLabel("Type of part").selectOption("sets");
  await page.getByRole("button", { name: /Upload 4 units/ }).click();
  await expect(page.getByRole("button", { name: /^s1 1$/ })).toBeVisible();

  const codebook = await api<{ id: number }>(request, "POST", `/job/${job.id}/codebook`, {
    items: [
      { type: "session", params: [{ name: "part", kind: "link", values: { sets: "part" } }] },
      {
        type: "unit_loop",
        units: [
          {
            mode: "assign",
            group: "part",
            from: { session: "part" },
            overlap: { placement: "disabled" },
            practice: { placement: "first", questions: ["topic"] },
            gold: { placement: "last", questions: ["topic"], health: { start: 1, wrong: -1, end: "low_quality" } },
          },
        ],
        layout: { template: "$unit.text" },
        children: [{ type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] } }],
      },
      { type: "end", name: "low_quality", outcome: "screenout", message: "Sorry, this study is over for you." },
    ],
  });
  await api(request, "PUT", `/job/${job.id}/deployment`, { codebookId: codebook.id });
  const links = await api<{ secret: string; params: Record<string, string> }[]>(request, "GET", `/job/${job.id}/invites`);
  const s1 = links.find((l) => l.params.part === "s1")!;

  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/?deployment=${job.id}&invite=${s1.secret}`);

  // The practice unit, answered wrongly: feedback, then on
  await question(coder, "Topic?");
  await expect(coder.getByText("Practice text")).toBeVisible();
  await coder.getByRole("button", { name: "2 other" }).click();
  await expect(coder.getByText("Not quite")).toBeVisible();
  await expect(coder.getByText("It is about an election.")).toBeVisible();
  await coder.getByRole("button", { name: "Continue", exact: true }).click();

  // The second practice unit accepts either answer: a check, then on
  await expect(coder.getByText("Second practice")).toBeVisible();
  await coder.getByRole("button", { name: "2 other" }).click();
  await expect(coder.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();

  // Their own unit
  await expect(coder.getByText("Own text")).toBeVisible();
  await coder.getByRole("button", { name: "1 politics" }).click();

  // The gold unit looks like any other; a wrong answer ends the session here
  await expect(coder.getByText("Gold text")).toBeVisible();
  await coder.getByRole("button", { name: "2 other" }).click();
  await expect(coder.getByText("Sorry, this study is over for you.")).toBeVisible();
});

test("the right answers of gold units, written in the loop editor", async ({ page, request }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Gold answers" });
  const units = await api<{ id: number; externalId: string }[]>(request, "POST", `/job/${job.id}/units`, {
    units: [
      { externalId: "u1", data: { text: "Own text" } },
      { externalId: "g1", data: { text: "An election report" } },
    ],
  });
  const id = (externalId: string) => units.find((u) => u.externalId === externalId)!.id;
  await api(request, "PUT", `/job/${job.id}/sets/part`, {
    sets: [
      { name: "s1", unitIds: [id("u1")] },
      { name: "_gold", unitIds: [id("g1")] },
    ],
  });
  await api(request, "POST", `/job/${job.id}/codebook`, {
    items: [
      {
        type: "unit_loop",
        name: "articles",
        units: [{ mode: "assign", group: "part", from: { draw: "balanced" }, overlap: { placement: "disabled" }, gold: { placement: "last", questions: ["topic"] } }],
        layout: { template: "$unit.text" },
        children: [{ type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] } }],
      },
    ],
  });

  await page.goto("/");
  await page.getByText("Gold answers").click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: /^Unit loop/ }).click();
  await page.getByRole("tab", { name: /Units/ }).click();
  await page.getByRole("button", { name: "Create gold values…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("An election report")).toBeVisible();
  await expect(dialog.getByText("0 of 1 have answers")).toBeVisible();
  await dialog.getByRole("button", { name: "politics" }).click();
  await dialog.getByRole("button", { name: "other" }).click();
  await expect(dialog.getByLabel("topic: cell")).toHaveValue("politics|other");
  await dialog.getByRole("button", { name: /Save 1 unit/ }).click();
  await expect(dialog).toBeHidden();

  const page1 = await api<{ units: { externalId: string; data: Record<string, unknown> }[] }>(request, "GET", `/job/${job.id}/units/page?offset=0&limit=10`);
  expect(page1.units.find((u) => u.externalId === "g1")!.data.topic_gold).toBe("politics|other");
});
