import { expect, test } from "./fixtures";
import type { StudyResponse } from "@annotinder/contracts";
import { api, list, question } from "./helpers";

// Practice and gold units (docs/architecture.md §6.2): a practice question
// tells the coder when they are wrong, and they answer again; a gold unit is checked silently, and
// running out of health ends the session at a screen-out.

test("a practice question gives feedback when wrong, answered again until right; a wrong gold unit ends the session at a screen-out", async ({
  page,
  request,
  browser,
}) => {
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /Empty study/ }).click();
  await page.getByPlaceholder(/Sentiment Analysis/).fill("Checked coders");
  await page.getByRole("button", { name: "Create Study" }).click();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  const study = (await list<StudyResponse>(request, "/study")).find((j) => j.name === "Checked coders")!;

  // The design first: answer_ and feedback_ columns are for its questions
  const codebook = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "per_coder" } },
    items: [
      {
        type: "unit_loop",
        id: "loop_1",
        units: {
          practice: "before",
          practiceCheck: { questions: ["topic"] },
          gold: "after",
          goldCheck: { questions: ["topic"], health: { start: 1, wrong: -1, end: "low_quality" } },
        },
        children: [
          { type: "layout", template: "$unit.text" },
          {
            type: "question",
            name: "topic",
            variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] },
          },
        ],
      },
      { type: "end", name: "low_quality", outcome: "screenout", message: "Sorry, this study is over for you." },
    ],
  });
  // Units with a coder set, test units and answer columns (role columns: taken as such by their names)
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "units.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "id,text,coder_set,test_set,answer_topic,feedback_topic\n" +
        "p1,Practice text,,practice,politics,It is about an election.\n" +
        "p2,Second practice,,practice,politics|other,\n" +
        "u1,Own text,s1,,,\n" +
        "g1,Gold text,,gold,politics,\n",
    ),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByRole("button", { name: /Upload 4 units/ }).click();
  await expect(page.getByRole("button", { name: /^s1 1$/ })).toBeVisible();

  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: codebook.id });
  const links = await api<{ secret: string; params: Record<string, string> }[]>(
    request,
    "GET",
    `/study/${study.id}/links`,
  );
  const s1 = links.find((l) => l.params.coder === "s1")!;

  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/code/${study.id}?link=${s1.secret}`);

  // The practice unit, answered wrongly: feedback with the question, and answering again until right
  await question(coder, "Topic?");
  await expect(coder.getByText("Practice text")).toBeVisible();
  await coder.getByRole("button", { name: "other", exact: true }).click();
  await expect(coder.getByText("Not quite")).toBeVisible();
  await expect(coder.getByText("It is about an election.")).toBeVisible();
  await expect(coder.getByText("Practice text")).toBeVisible();
  await coder.getByRole("button", { name: "politics", exact: true }).click();
  await expect(coder.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();

  // The second practice unit accepts either answer: a check, then on
  await expect(coder.getByText("Second practice")).toBeVisible();
  await coder.getByRole("button", { name: "other", exact: true }).click();
  await expect(coder.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();

  // Their own unit
  await expect(coder.getByText("Own text")).toBeVisible();
  await coder.getByRole("button", { name: "politics", exact: true }).click();

  // The gold unit looks like any other; a wrong answer ends the session here
  await expect(coder.getByText("Gold text")).toBeVisible();
  await coder.getByRole("button", { name: "other", exact: true }).click();
  await expect(coder.getByText("Sorry, this study is over for you.")).toBeVisible();
});

test("the right answers of gold units, written in the loop editor", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Gold answers" });
  const units = await api<{ id: number; externalId: string }[]>(request, "POST", `/study/${study.id}/units`, {
    units: [
      { externalId: "u1", data: { text: "Own text" } },
      { externalId: "g1", data: { text: "An election report" } },
    ],
  });
  const id = (externalId: string) => units.find((u) => u.externalId === externalId)!.id;
  await api(request, "PUT", `/study/${study.id}/sets/test_set`, {
    sets: [{ name: "gold", unitIds: [id("g1")] }],
  });
  await api(request, "POST", `/study/${study.id}/design`, {
    // The gold units: test_set's
    session: { invite: { mode: "crowd" } },
    items: [
      {
        type: "unit_loop",
        id: "loop_1",
        name: "articles",
        units: { gold: "after", goldCheck: { questions: ["topic"] } },
        children: [
          { type: "layout", template: "$unit.text" },
          {
            type: "question",
            name: "topic",
            variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] },
          },
        ],
      },
    ],
  });

  await page.goto("/research");
  await page.getByText("Gold answers").click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  // The loop's form: which units coders get
  await page
    .getByRole("button", { name: /^Unit loop/ })
    .first()
    .click();
  // The checks are in the folded Test units section: its header sums them up
  const tests = page.getByRole("button", { name: /^Test units/ });
  await expect(tests).toContainText("gold after · checks: topic");
  await tests.click();
  await page.getByRole("button", { name: "Create gold values…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("An election report")).toBeVisible();
  await expect(dialog.getByText("0 of 1 have answers")).toBeVisible();
  await dialog.getByRole("button", { name: "politics" }).click();
  await dialog.getByRole("button", { name: "other" }).click();
  await expect(dialog.getByLabel("topic: cell")).toHaveValue("politics|other");
  await dialog.getByRole("button", { name: /Save 1 unit/ }).click();
  await expect(dialog).toBeHidden();

  const page1 = await api<{ units: { externalId: string; data: Record<string, unknown> }[] }>(
    request,
    "GET",
    `/study/${study.id}/units/page?offset=0&limit=10`,
  );
  expect(page1.units.find((u) => u.externalId === "g1")!.data.answer_topic).toBe("politics|other");
});
