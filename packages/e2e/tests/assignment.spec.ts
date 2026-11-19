import { expect, test } from "./fixtures";
import type { StudyResponse, UnitResponse } from "@annotinder/contracts";
import { api, question } from "./helpers";

// Who gets which units (docs/plans/unit-assignment.md): the session settings
// show the coders and conditions against the units; the first deploy asks
// whether coders sign in; a condition drawn at the start, linked to a set
// column, gives each session the units of its value.

const loop = (overlap?: unknown) => ({
  type: "unit_loop",
  units: [overlap ? { overlap } : {}],
  layout: { template: "$unit.text" },
  children: [{ type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] } }],
});

async function studyWithColumn(request: Parameters<typeof api>[0], name: string, column: string, cells: Record<string, string>): Promise<StudyResponse> {
  const study = await api<StudyResponse>(request, "POST", "/study", { name });
  const units = await api<UnitResponse[]>(request, "POST", `/study/${study.id}/units`, {
    units: Object.keys(cells).map((text, i) => ({ externalId: `u${i + 1}`, data: { text } })),
  });
  const bySet = new Map<string, number[]>();
  for (const unit of units) {
    const text = String(unit.data.text);
    bySet.set(cells[text], [...(bySet.get(cells[text]) ?? []), unit.id]);
  }
  await api(request, "PUT", `/study/${study.id}/sets/${column}`, { sets: [...bySet].map(([name, unitIds]) => ({ name, unitIds })) });
  return study;
}

test("the session settings show the coders and conditions; the first deploy asks whether coders sign in", async ({ page, request }) => {
  const study = await studyWithColumn(request, "Two coders", "coder", { "Anna's text": "anna", "Bob's text": "bob", "Shared text": "_overlap" });
  await api(request, "POST", `/study/${study.id}/design`, { session: { params: [], coders: { column: "coder" } }, items: [loop()] });

  await page.goto(`/research/studies/${study.id}/editor`);
  await page.getByRole("button", { name: "Session", exact: true }).click();
  await expect(page.getByText("2 coders: names, so a link per coder.")).toBeVisible();

  // An assigned condition by link doubles the links
  await page.getByRole("button", { name: "Condition", exact: true }).click();
  await page.getByLabel("How the condition is assigned").selectOption("link");
  await expect(page.getByText("Deploying makes 4 links for these.")).toBeVisible();

  // Linked to a column that doesn't have its values: shown right away
  await page.getByLabel("Linked to units", { exact: true }).selectOption("coder");
  await expect(page.getByText('No units for "control", "experiment" in column "coder"')).toBeVisible();
  await page.getByRole("button", { name: /^Remove condition_1$/ }).click();

  // The first deploy: whether coders sign in
  await page.getByRole("button", { name: "Deploy…", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Coders sign in").selectOption("optional");
  await dialog.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect.poll(async () => (await api<StudyResponse>(request, "GET", `/study/${study.id}`)).signIn).toBe("optional");

  // A link per coder on the Links page
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await page.getByRole("button", { name: "Links", exact: true }).click();
  await expect(page.getByRole("cell", { name: "coder anna" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "coder bob" })).toBeVisible();
});

test("a condition drawn at the start, linked to units: balanced, each session codes its value's units", async ({ request, browser }) => {
  const study = await studyWithColumn(request, "Framing", "framing", { "Calm report": "control", "Alarming report": "experiment" });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { params: [], conditions: [{ name: "framing", values: ["control", "experiment"], assign: "random", draw: "balanced", units: "framing" }] },
    items: [loop()],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const links = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);
  expect(links).toHaveLength(1);

  // Two sessions on the one link: one of each condition, each with only its own unit
  const seen: string[] = [];
  for (let i = 0; i < 2; i++) {
    const coder = await (await browser.newContext()).newPage();
    await coder.goto(`/code/${study.id}?link=${links[0].secret}`);
    await question(coder, "Topic?");
    const text = (await coder.getByText(/report/).first().textContent())!.trim();
    seen.push(text);
    await coder.getByRole("button", { name: /politics/ }).click();
    await expect(coder.getByText(/completed|Thank you/i).first()).toBeVisible();
  }
  expect(seen.sort()).toEqual(["Alarming report", "Calm report"]);
});

test("two loops filter one set column: first the pre units, then the post units", async ({ request, browser }) => {
  const study = await studyWithColumn(request, "Pre and post", "phase", { "Before text": "pre", "After text": "post" });
  const filtered = (only: string, name: string, text: string) => ({
    ...loop(),
    label: name,
    units: [{ filter: { column: "phase", only: [only] } }],
    children: [{ type: "question", name, variable: { type: "nominal", question: text, options: [{ value: "yes" }, { value: "no" }] } }],
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    items: [filtered("pre", "before", "Before?"), filtered("post", "after", "After?")],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);

  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/code/${study.id}?link=${link.secret}`);
  await question(coder, "Before?");
  await expect(coder.getByText("Before text")).toBeVisible();
  await coder.getByRole("button", { name: /yes/ }).click();
  await question(coder, "After?");
  await expect(coder.getByText("After text")).toBeVisible();
  await expect(coder.getByText("Before text")).toHaveCount(0);
});

test("uploading units with a set column makes the column, shown with its values", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Set column upload" });
  await page.goto(`/research/studies/${study.id}/units`);
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "units.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,text,coder\nu1,First,anna\nu2,Second,bob\nu3,Third,anna;bob\nu4,Fourth,_overlap\n"),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByLabel("Type of coder").selectOption("sets");
  await page.getByRole("button", { name: /Upload 4 units/ }).click();
  await expect(page.getByRole("button", { name: /^anna 2$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^bob 2$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^_overlap 1$/ })).toBeVisible();
});
