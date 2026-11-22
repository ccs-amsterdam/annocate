import { expect, test } from "./fixtures";
import type { StudyResponse, UnitResponse } from "@annotinder/contracts";
import { api, question } from "./helpers";

// Who gets which units (docs/architecture.md §6): the coder unit assignments
// show the coders against the units, and make the coder distribution column; a random
// condition linked to a set column gives each session the units of its value.

const loop = (overlap?: unknown) => ({
  type: "unit_loop",
  units: overlap ? { overlap } : {},
  layout: { template: "$unit.text" },
  children: [
    {
      type: "question",
      name: "topic",
      variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] },
    },
  ],
});

async function studyWithColumn(
  request: Parameters<typeof api>[0],
  name: string,
  column: string,
  cells: Record<string, string>,
): Promise<StudyResponse> {
  const study = await api<StudyResponse>(request, "POST", "/study", { name });
  const units = await api<UnitResponse[]>(request, "POST", `/study/${study.id}/units`, {
    units: Object.keys(cells).map((text, i) => ({ externalId: `u${i + 1}`, data: { text } })),
  });
  const bySet = new Map<string, number[]>();
  for (const unit of units) {
    const text = String(unit.data.text);
    bySet.set(cells[text], [...(bySet.get(cells[text]) ?? []), unit.id]);
  }
  await api(request, "PUT", `/study/${study.id}/sets/${column}`, {
    sets: [...bySet].map(([name, unitIds]) => ({ name, unitIds })),
  });
  return study;
}

test("the coder unit assignments show the coders; a dialog makes or updates the coder distribution; a link per coder", async ({
  page,
  request,
}) => {
  const study = await studyWithColumn(request, "Two coders", "coder", {
    "Anna's text": "anna",
    "Bob's text": "bob",
    "Shared text": "_overlap",
  });
  await api(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", column: "coder", link: "per_coder" } },
    items: [loop()],
  });

  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^Coder unit assignments/ }).click();
  await expect(page.getByText("2 coders.", { exact: true })).toBeVisible();

  // Signing in needs email addresses
  await page.getByLabel("One link: coders sign in with the email address in the column").check();
  await expect(page.getByText(/Signing in needs email addresses/)).toBeVisible();
  await page.getByLabel(/A link per coder/).check();

  // Made again in the dialog: three named coders, two per unit
  await page.getByRole("button", { name: "Create or update coder distribution…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Names, each with their own link").check();
  await dialog.getByLabel(/Names \(one per line\)/).fill("carla\ndave\nemma");
  await dialog.getByLabel("Coders per unit").fill("2");
  // The column exists: making it asks first
  await dialog.getByRole("button", { name: "Make the column" }).click();
  await expect(dialog.getByText(/Column coder exists/)).toBeVisible();
  await dialog.getByRole("button", { name: "Overwrite" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("3 coders.", { exact: true })).toBeVisible();

  // Deployed: a link per coder on the Links page
  // Saved in the editor, deployed on the Deploy page
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText(/not deployed/)).toBeVisible();
  await page.getByRole("navigation", { name: "Study" }).getByRole("button", { name: "Deploy", exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deployed" })).toBeVisible();
  await page.getByRole("button", { name: "Links", exact: true }).click();
  for (const name of ["carla", "dave", "emma"])
    await expect(page.getByRole("cell", { name: `coder ${name}` })).toBeVisible();
});

test("a random condition linked to units: balanced, each session codes its value's units", async ({
  request,
  browser,
}) => {
  const study = await studyWithColumn(request, "Framing", "framing", {
    "Calm report": "control",
    "Alarming report": "experiment",
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    items: [
      { type: "computed", name: "framing", variable: { type: "random", draw: "balanced", units: "framing" } },
      loop(),
    ],
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
    const text = (await coder
      .getByText(/report/)
      .first()
      .textContent())!.trim();
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
    units: { filter: { column: "phase", only: [only] } },
    children: [
      {
        type: "question",
        name,
        variable: { type: "nominal", question: text, options: [{ value: "yes" }, { value: "no" }] },
      },
    ],
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

test("a link where coders pick their name: a name stays on the first device that picks it", async ({
  request,
  browser,
}) => {
  const study = await studyWithColumn(request, "Pick a name", "coder", {
    "Anna's text": "anna",
    "Bob's text": "bob",
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", column: "coder", link: "pick_name" } },
    items: [loop()],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);

  const first = await (await browser.newContext()).newPage();
  await first.goto(`/code/${study.id}?link=${link.secret}`);
  await expect(first.getByText("Who are you?")).toBeVisible();
  await first.getByRole("button", { name: "anna", exact: true }).click();
  await question(first, "Topic?");
  await expect(first.getByText("Anna's text")).toBeVisible();

  // Another device: anna is taken
  const second = await (await browser.newContext()).newPage();
  await second.goto(`/code/${study.id}?link=${link.secret}`);
  await expect(second.getByRole("button", { name: /anna/ })).toBeDisabled();
  await second.getByRole("button", { name: "bob", exact: true }).click();
  await expect(second.getByText("Bob's text")).toBeVisible();
});

test("the preview runs as a coder picked above it", async ({ page, request }) => {
  const study = await studyWithColumn(request, "Preview as", "coder", {
    "Anna's text": "anna",
    "Bob's text": "bob",
  });
  await api(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", column: "coder", link: "per_coder" } },
    items: [loop()],
  });
  await page.goto(`/research/studies/${study.id}/overview`);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Anna's text")).toBeVisible();
  await page.getByLabel("Preview as coder").selectOption("bob");
  await expect(page.getByText("Bob's text")).toBeVisible();
});

test("dividing units again keeps the units coders already saw", async ({ page, request, browser }) => {
  const study = await studyWithColumn(request, "Redistribute", "coder", {
    "Anna's text": "anna",
    "Bob's text": "bob",
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", column: "coder", link: "pick_name" } },
    items: [loop()],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);
  // Anna starts coding: she is shown her unit
  const anna = await (await browser.newContext()).newPage();
  await anna.goto(`/code/${study.id}?link=${link.secret}`);
  await anna.getByRole("button", { name: "anna", exact: true }).click();
  await question(anna, "Topic?");

  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^Coder unit assignments/ }).click();
  await page.getByRole("button", { name: "Create or update coder distribution…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Names, each with their own link").check();
  await dialog.getByLabel(/Names \(one per line\)/).fill("anna\nbob\ncarla");
  const keep = dialog.getByLabel(/Keep the units coders already have/);
  await expect(keep).toBeChecked();
  await expect(dialog.getByText(/1 unit assignments are kept/)).toBeVisible();
  await dialog.getByRole("button", { name: "Make the column" }).click();
  await dialog.getByRole("button", { name: "Overwrite" }).click();
  await expect(dialog).toBeHidden();
  const groups = await api<{ name: string; sets: { name: string; unitIds: number[] }[] }[]>(
    request,
    "GET",
    `/study/${study.id}/sets`,
  );
  // Anna's text is the first unit (u1)
  const units = await api<{ id: number; externalId: string }[]>(request, "GET", `/study/${study.id}/units`);
  const annaUnit = units.find((u) => u.externalId === "u1")!.id;
  const column = groups.find((g) => g.name === "coder")!;
  expect(column.sets.find((s) => s.name === "anna")!.unitIds).toContain(annaUnit);
});
