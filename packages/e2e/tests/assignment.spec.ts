import { expect, test } from "./fixtures";
import type { StudyResponse, UnitResponse } from "@annotinder/contracts";
import { addCoders, api, list, question } from "./helpers";

// Who gets which units (docs/architecture.md §6, docs/plans/unit-sets.md):
// the who codes show the coders of the units' coder_set, and a
// dialog makes it from the study's expert coders (the Coders page has them);
// an experiment that selects units gives each session the
// units of its condition (condition_set); a loop shows one part (part_set).

const loop = (overlap?: unknown) => ({
  type: "unit_loop",
  id: "loop_1",
  units: overlap ? { overlap } : {},
  children: [
    { type: "layout", template: "$unit.text" },
    {
      type: "question",
      name: "topic",
      variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] },
    },
  ],
});

/**
 * A study with a unit per text, and role columns: per column, per text its
 * value (texts without one: none). A coder set's values are made expert
 * coders first.
 */
async function studyWithSets(
  request: Parameters<typeof api>[0],
  name: string,
  texts: string[],
  columns: Record<string, Record<string, string>>,
): Promise<{ study: StudyResponse; units: UnitResponse[] }> {
  const study = await api<StudyResponse>(request, "POST", "/study", { name });
  const units = await api<UnitResponse[]>(request, "POST", `/study/${study.id}/units`, {
    units: texts.map((text, i) => ({ externalId: `u${i + 1}`, data: { text } })),
  });
  for (const [column, cells] of Object.entries(columns)) {
    const bySet = new Map<string, number[]>();
    for (const unit of units) {
      const value = cells[String(unit.data.text)];
      if (value) bySet.set(value, [...(bySet.get(value) ?? []), unit.id]);
    }
    if (column === "coder_set") await addCoders(request, study.id, [...bySet.keys()]);
    await api(request, "PUT", `/study/${study.id}/sets/${column}`, {
      sets: [...bySet].map(([name, unitIds]) => ({ name, unitIds })),
    });
  }
  return { study, units };
}

/** A study whose units are in one role column: per text its value. */
async function studyWithColumn(
  request: Parameters<typeof api>[0],
  name: string,
  column: string,
  cells: Record<string, string>,
): Promise<StudyResponse> {
  return (await studyWithSets(request, name, Object.keys(cells), { [column]: cells })).study;
}

type Groups = { name: string; sets: { name: string; unitIds: number[]; ordered?: boolean }[] }[];

test("the who codes show the coders; a dialog makes or updates the coder set, keeping the test units; a link per coder", async ({
  page,
  request,
}) => {
  const { study, units } = await studyWithSets(request, "Two coders", ["Anna's text", "Bob's text", "Shared text"], {
    coder_set: { "Anna's text": "anna", "Bob's text": "bob" },
    test_set: { "Shared text": "overlap" },
  });
  await api(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "per_coder" } },
    items: [loop()],
  });

  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^Who codes/ }).click();
  await expect(page.getByText("2 coders in the coder set.", { exact: true })).toBeVisible();

  // Signing in needs an email address for every coder with units
  await page.getByLabel(/One link: coders sign in with their email address/).check();
  await expect(page.getByText(/these coders have none: anna, bob/)).toBeVisible();
  await page.getByLabel(/A link per coder/).check();

  // Made again in the dialog: three new coders (added under Manage coders), two per unit
  await page.getByRole("button", { name: "Update coder set…" }).click();
  const dialog = page.getByRole("dialog");
  // It opens on Select coders, with the coder set's coders checked
  await expect(dialog.getByRole("tab", { name: "Select coders" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByLabel("anna", { exact: true })).toBeChecked();
  await dialog.getByRole("tab", { name: "Manage coders" }).click();
  await dialog.getByLabel(/Coders, one per line/).fill("carla\ndave, dave@uni.nl\nanna");
  // What was read, with the problem per line: anna is a coder already
  await expect(dialog.getByText("3 lines read")).toBeVisible();
  await expect(dialog.getByText("There is a coder with this id already")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add coders" })).toBeDisabled();
  await dialog.getByLabel(/Coders, one per line/).fill("carla\ndave, dave@uni.nl\nemma");
  await dialog.getByRole("button", { name: "Add 3 coders" }).click();
  await expect(dialog.getByText("5 expert coders")).toBeVisible();
  await dialog.getByRole("tab", { name: "Select coders" }).click();
  await dialog.getByRole("button", { name: "None", exact: true }).click();
  for (const name of ["carla", "dave", "emma"]) await dialog.getByLabel(name, { exact: true }).check();
  await dialog.getByLabel("Coders per unit").fill("2");
  // The current test units are shown, and kept (not editable without redistributing)
  await expect(dialog.getByLabel("Overlap units")).toHaveValue("1");
  await expect(dialog.getByLabel("Overlap units")).toBeDisabled();
  await expect(dialog.getByText(/plus 1 overlap test units for everyone/)).toBeVisible();
  // The coder set exists: making it asks first
  await dialog.getByRole("button", { name: "Make the coder set" }).click();
  await expect(dialog.getByText(/The coder set exists \(2 coders\)/)).toBeVisible();
  await dialog.getByRole("button", { name: "Overwrite" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("3 coders in the coder set.", { exact: true })).toBeVisible();
  // The overlap unit is still the test unit, and in no coder's set
  const groups = await api<Groups>(request, "GET", `/study/${study.id}/sets`);
  const shared = units.find((u) => u.data.text === "Shared text")!.id;
  expect(groups.find((g) => g.name === "test_set")!.sets).toMatchObject([{ name: "overlap", unitIds: [shared] }]);
  const coderSet = groups.find((g) => g.name === "coder_set")!;
  expect(coderSet.sets.map((s) => s.name).sort()).toEqual(["carla", "dave", "emma"]);
  expect(coderSet.sets.flatMap((s) => s.unitIds)).not.toContain(shared);

  // Deployed: a link per coder on the Links page
  // (The design itself is as saved: nothing to save; the units changed)
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(page.getByText(/not deployed/)).toBeVisible();
  await page.getByRole("navigation", { name: "Study" }).getByRole("button", { name: "Deploy", exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deployed" })).toBeVisible();
  await page.getByRole("button", { name: "Links", exact: true }).click();
  for (const name of ["carla", "dave", "emma"])
    await expect(page.getByRole("cell", { name: `coder ${name}` })).toBeVisible();
});

test("the coder set dialog draws test units anew when redistributing them", async ({ page, request }) => {
  const texts = ["One", "Two", "Three", "Four", "Five", "Six"];
  const { study } = await studyWithSets(request, "Redistribute tests", texts, {});
  await api(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "per_coder" } },
    items: [loop()],
  });
  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^Who codes/ }).click();
  await page.getByRole("button", { name: "Create coder set…" }).click();
  const dialog = page.getByRole("dialog");
  // No expert coders yet: it opens on Manage coders
  await expect(dialog.getByRole("tab", { name: "Manage coders" })).toHaveAttribute("aria-selected", "true");
  await dialog.getByLabel(/Coders, one per line/).fill("anna\nbob");
  await dialog.getByRole("button", { name: "Add 2 coders" }).click();
  // Without a coder set, every coder is selected
  await dialog.getByRole("tab", { name: "Select coders" }).click();
  await expect(dialog.getByLabel("bob", { exact: true })).toBeChecked();
  await expect(dialog.getByText("No test units yet: switch this on to draw some.")).toBeVisible();
  await dialog.getByLabel(/Redistribute test units/).check();
  await dialog.getByLabel("Overlap units").fill("2");
  await dialog.getByLabel("Gold units").fill("1");
  // Gold units need their right answers
  await expect(dialog.getByText(/named answer_<question>/)).toBeVisible();
  await dialog.getByRole("button", { name: "Make the coder set" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("2 coders in the coder set.", { exact: true })).toBeVisible();

  const groups = await api<Groups>(request, "GET", `/study/${study.id}/sets`);
  const tests = groups.find((g) => g.name === "test_set")!.sets;
  expect(tests.map((s) => [s.name, s.unitIds.length]).sort()).toEqual([
    ["gold", 1],
    ["overlap", 2],
  ]);
  // The coders divide the other three units
  const coded = groups.find((g) => g.name === "coder_set")!.sets.flatMap((s) => s.unitIds);
  expect(new Set(coded).size).toBe(3);
  for (const id of tests.flatMap((s) => s.unitIds)) expect(coded).not.toContain(id);
});

test("an experiment that selects units: balanced, each session codes its condition's units", async ({
  request,
  browser,
}) => {
  const study = await studyWithColumn(request, "Framing", "condition_set", {
    "Calm report": "control",
    "Alarming report": "experiment",
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "crowd" } },
    items: [
      { type: "experiment", name: "framing", variable: { type: "experiment", draw: "balanced", selectsUnits: true } },
      loop(),
    ],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const links = await list<{ secret: string }>(request, `/study/${study.id}/links`);
  expect(links).toHaveLength(1);

  // Two sessions on the one link: one of each condition, each with only its own unit
  const seen: string[] = [];
  for (let i = 0; i < 2; i++) {
    const coder = await (await browser.newContext()).newPage();
    await coder.goto(`/code/${study.publicId}?link=${links[0].secret}`);
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

test("an experiment whose condition is a URL parameter's value selects that condition's units", async ({
  request,
  browser,
}) => {
  const study = await studyWithColumn(request, "Framing by link", "condition_set", {
    "Calm report": "control",
    "Alarming report": "experiment",
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: {
      invite: { mode: "crowd" },
      urlParams: [{ name: "framing_arm", param: "arm", values: [{ value: "control" }, { value: "experiment" }] }],
    },
    items: [
      {
        type: "experiment",
        name: "framing",
        variable: { type: "experiment", draw: "url_param", param: "framing_arm", selectsUnits: true },
      },
      loop(),
    ],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const [link] = await list<{ secret: string }>(request, `/study/${study.id}/links`);

  // The same condition every time: the link's
  for (const [arm, text, other] of [
    ["experiment", "Alarming report", "Calm report"],
    ["experiment", "Alarming report", "Calm report"],
    ["control", "Calm report", "Alarming report"],
  ]) {
    const coder = await (await browser.newContext()).newPage();
    await coder.goto(`/code/${study.publicId}?link=${link.secret}&arm=${arm}`);
    await question(coder, "Topic?");
    await expect(coder.getByText(text)).toBeVisible();
    await expect(coder.getByText(other)).toHaveCount(0);
  }
});

test("two loops each show one part: first the pre units, then the post units", async ({ request, browser }) => {
  const study = await studyWithColumn(request, "Pre and post", "part_set", {
    "Before text": "pre",
    "After text": "post",
  });
  const filtered = (part: string, name: string, text: string) => ({
    ...loop(),
    id: part === "pre" ? "loop_1" : "loop_2",
    label: name,
    units: { part },
    children: [
      loop().children[0],
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
  const [link] = await list<{ secret: string }>(request, `/study/${study.id}/links`);

  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/code/${study.publicId}?link=${link.secret}`);
  await question(coder, "Before?");
  await expect(coder.getByText("Before text")).toBeVisible();
  await coder.getByRole("button", { name: /yes/ }).click();
  await question(coder, "After?");
  await expect(coder.getByText("After text")).toBeVisible();
  await expect(coder.getByText("Before text")).toHaveCount(0);
});

test("a loop's part, chosen in the editor from the part set's values", async ({ page, request }) => {
  const study = await studyWithColumn(request, "Choose a part", "part_set", {
    "Before text": "pre",
    "After text": "post",
  });
  await api(request, "POST", `/study/${study.id}/design`, { items: [loop()] });
  await page.goto(`/research/studies/${study.id}/design`);
  await page
    .getByRole("button", { name: /^Unit loop/ })
    .first()
    .click();
  const part = page.getByLabel("Part", { exact: true });
  await expect(part).toHaveValue("");
  await part.selectOption("post");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => {
      const versions = await list<{ id: number }>(request, `/study/${study.id}/design`);
      const latest = await api<{ items: { units?: unknown }[] }>(
        request,
        "GET",
        `/study/${study.id}/design/${versions[versions.length - 1].id}`,
      );
      return latest.items[0].units;
    })
    .toEqual({ part: "post" });
});

test("uploading units with role columns makes them, shown with their values", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Set column upload" });
  await addCoders(request, study.id, ["anna", "bob"]);
  await page.goto(`/research/studies/${study.id}/units`);
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  // A coder set names the study's expert coders only: a file with another coder isn't uploaded
  await page.locator("input[type=file]").setInputFiles({
    name: "unknown.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,text,coder_set\nu1,First,anna\nu2,Second,carl\n"),
  });
  await expect(page.getByText(/names a coder who isn't an expert coder of this study: carl\./)).toBeVisible();
  await expect(page.getByRole("button", { name: /Upload 2 units/ })).toBeDisabled();
  await page.getByRole("button", { name: "Choose another file" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "units.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "id,text,coder_set,test_set\nu1,First,anna,\nu2,Second,bob,\nu3,Third,anna;bob,\nu4,Fourth,,overlap\n",
    ),
  });
  // Columns named like a role column are that column
  await expect(page.getByLabel("Role of coder_set")).toHaveValue("coder_set");
  await expect(page.getByLabel("Role of test_set")).toHaveValue("test_set");
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByRole("button", { name: /Upload 4 units/ }).click();
  await expect(page.getByRole("button", { name: /^anna 2$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^bob 2$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^overlap 1$/ })).toBeVisible();
  // The table has the role column once (its cells, under its label), not again as a field
  await expect(page.getByRole("cell", { name: "Coder set", exact: true })).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "coder_set", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "anna;bob" })).toBeVisible();
});

test("a link where coders pick their name: a name stays on the first device that picks it", async ({
  request,
  browser,
}) => {
  const study = await studyWithColumn(request, "Pick a name", "coder_set", {
    "Anna's text": "anna",
    "Bob's text": "bob",
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "pick_name" } },
    items: [loop()],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const [link] = await list<{ secret: string }>(request, `/study/${study.id}/links`);

  const first = await (await browser.newContext()).newPage();
  await first.goto(`/code/${study.publicId}?link=${link.secret}`);
  await expect(first.getByText("Who are you?")).toBeVisible();
  await first.getByRole("button", { name: "anna", exact: true }).click();
  await question(first, "Topic?");
  await expect(first.getByText("Anna's text")).toBeVisible();

  // Another device: anna is taken
  const second = await (await browser.newContext()).newPage();
  await second.goto(`/code/${study.publicId}?link=${link.secret}`);
  await expect(second.getByRole("button", { name: /anna/ })).toBeDisabled();
  await second.getByRole("button", { name: "bob", exact: true }).click();
  await expect(second.getByText("Bob's text")).toBeVisible();
});

test("the preview runs as a coder picked above it", async ({ page, request }) => {
  const study = await studyWithColumn(request, "Preview as", "coder_set", {
    "Anna's text": "anna",
    "Bob's text": "bob",
  });
  await api(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "per_coder" } },
    items: [loop()],
  });
  await page.goto(`/research/studies/${study.id}/overview`);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Anna's text")).toBeVisible();
  await page.getByLabel("Preview as coder").selectOption("bob");
  await expect(page.getByText("Bob's text")).toBeVisible();
});

test("dividing units again keeps the units coders already coded", async ({ page, request, browser }) => {
  const study = await studyWithColumn(request, "Redistribute", "coder_set", {
    "Anna's text": "anna",
    "Bob's text": "bob",
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "pick_name" } },
    items: [loop()],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const [link] = await list<{ secret: string }>(request, `/study/${study.id}/links`);
  // Anna codes her unit
  const anna = await (await browser.newContext()).newPage();
  await anna.goto(`/code/${study.publicId}?link=${link.secret}`);
  await anna.getByRole("button", { name: "anna", exact: true }).click();
  await question(anna, "Topic?");
  await anna.getByRole("button", { name: /politics/ }).click();
  await expect
    .poll(
      async () =>
        (await api<{ coders: { coded: number[] }[] }>(request, "GET", `/study/${study.id}/coders/units`)).coders[0]
          ?.coded.length,
    )
    .toBe(1);

  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^Who codes/ }).click();
  await page.getByRole("button", { name: "Update coder set…" }).click();
  const dialog = page.getByRole("dialog");
  // A third coder joins anna and bob
  await dialog.getByRole("tab", { name: "Manage coders" }).click();
  await dialog.getByLabel(/Coders, one per line/).fill("carla");
  await dialog.getByRole("button", { name: "Add 1 coder" }).click();
  await dialog.getByRole("tab", { name: "Select coders" }).click();
  await dialog.getByLabel("carla", { exact: true }).check();
  const keep = dialog.getByLabel(/Keep the units coders already coded/);
  await expect(keep).toBeChecked();
  await expect(dialog.getByText(/1 unit assignments are kept/)).toBeVisible();
  await dialog.getByRole("button", { name: "Make the coder set" }).click();
  await dialog.getByRole("button", { name: "Overwrite" }).click();
  await expect(dialog).toBeHidden();
  const groups = await api<{ name: string; sets: { name: string; unitIds: number[] }[] }[]>(
    request,
    "GET",
    `/study/${study.id}/sets`,
  );
  // Anna's text is the first unit (u1)
  const units = await list<{ id: number; externalId: string }>(request, `/study/${study.id}/units`);
  const annaUnit = units.find((u) => u.externalId === "u1")!.id;
  const column = groups.find((g) => g.name === "coder_set")!;
  expect(column.sets.find((s) => s.name === "anna")!.unitIds).toContain(annaUnit);
});

test("expert coders without a coder set: how coders get in waits for one, and the first design is for expert coders", async ({
  page,
  request,
}) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "No coder set yet", coderKind: "expert" });
  await api(request, "POST", `/study/${study.id}/units`, { units: [{ externalId: "u1", data: { text: "A text" } }] });
  // No design yet: the editor starts one for the study's expert coders, with a link each
  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^Who codes/ }).click();
  await expect(page.getByText("expert coders, a link each").first()).toBeVisible();
  // Who codes is the study's: said here, not chosen
  await expect(page.getByRole("radio", { name: /Crowd/ })).toHaveCount(0);
  await expect(page.getByText(/A coder set is required/)).toBeVisible();
  await expect(page.getByLabel(/A link per coder/)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create coder set…" })).toBeVisible();
});

test("the Units page creates special sets: a part set anew (asking first), units without a value assigned, a test set", async ({
  page,
  request,
}) => {
  const texts = ["One", "Two", "Three", "Four", "Five", "Six"];
  const { study, units } = await studyWithSets(request, "Special sets", texts, {
    coder_set: { One: "anna", Two: "bob" },
    part_set: { One: "pre" },
    test_set: { Six: "overlap" },
  });
  const id = (text: string) => units.find((u) => u.data.text === text)!.id;
  const sets = async (column: string) =>
    (await api<Groups>(request, "GET", `/study/${study.id}/sets`)).find((g) => g.name === column)?.sets ?? [];
  await page.goto(`/research/studies/${study.id}/units`);
  const create = async (label: string) => {
    await page.getByRole("button", { name: "Create special set…" }).click();
    await page.getByRole("menuitem", { name: new RegExp(`^${label}`) }).click();
  };

  // A part set exists: making it anew asks before overwriting
  await create("Part set");
  await expect(page.getByText("The units have a part set")).toBeVisible();
  await expect(page.getByText("4 units have no value and aren't test units.")).toBeVisible();
  await page.getByLabel("Names").fill("pre\npost");
  await page.getByRole("button", { name: "Make the part set with 2 values" }).click();
  await expect(page.getByText("The part set exists (pre): overwrite it?")).toBeVisible();
  await page.getByRole("button", { name: "Overwrite" }).click();
  await expect
    .poll(async () => (await sets("part_set")).map((s) => [s.name, s.unitIds.length]).sort())
    .toEqual([
      ["post", 3],
      ["pre", 3],
    ]);

  // Now every unit has a part: nothing to assign
  await create("Part set");
  await expect(page.getByLabel(/Assign units without a value/)).toBeDisabled();
  await expect(page.getByText(/Every unit has a value or is a test unit/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // The coder set keeps anna's and bob's units; the three units without a coder (not the overlap unit) are divided
  await create("Coder set");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("3 units have no value and aren't test units.")).toBeVisible();
  await dialog.getByLabel(/Assign units without a value/).check();
  await expect(dialog.getByText(/Gives the 3 units without a coder to the 2 coders selected/)).toBeVisible();
  await dialog.getByRole("button", { name: "Assign 3 units" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => {
      const coders = await sets("coder_set");
      return [coders.map((s) => s.unitIds[0]), coders.flatMap((s) => s.unitIds).sort((a, b) => a - b)];
    })
    .toEqual([[id("One"), id("Two")], ["One", "Two", "Three", "Four", "Five"].map(id).sort((a, b) => a - b)]);

  // A test set exists: drawn anew after asking; practice units in order
  await create("Test set");
  await expect(dialog.getByLabel("Overlap units")).toHaveValue("1");
  await dialog.getByLabel("Practice units").fill("2");
  await dialog.getByRole("button", { name: "Make the test set" }).click();
  await expect(dialog.getByText(/The test set exists \(1 overlap\): overwrite it\?/)).toBeVisible();
  await dialog.getByRole("button", { name: "Overwrite" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await sets("test_set")).map((s) => [s.name, s.unitIds.length, s.ordered]).sort())
    .toEqual([
      ["overlap", 1, false],
      ["practice", 2, true],
    ]);
  await expect(page.getByRole("cell", { name: "practice#2" })).toBeVisible();
});

test("the Coders page: adding coders from a list, their units deployed and in the draft, an email address, deleting a coder", async ({
  page,
  request,
}) => {
  const { study, units } = await studyWithSets(request, "Coders page", ["One", "Two", "Three"], {
    coder_set: { One: "anna", Two: "bob", Three: "bob" },
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "per_coder" } },
    items: [loop()],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  // The draft takes a unit from bob
  await api(request, "PUT", `/study/${study.id}/sets/coder_set`, {
    sets: [
      { name: "anna", unitIds: [units[0].id] },
      { name: "bob", unitIds: [units[1].id] },
    ],
  });

  await page.goto(`/research/studies/${study.id}/coders`);
  const row = (coder: string) =>
    page.getByRole("row").filter({ has: page.getByRole("cell", { name: coder, exact: true }) });
  // Most left to do first; bob's draft differs from what is deployed
  await expect(page.getByRole("columnheader", { name: "Remaining" })).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("row").nth(1)).toContainText("bob");
  await row("bob")
    .getByRole("button", { name: /the draft assigns different units/ })
    .click();
  await expect(page.getByText("The draft assigns different units; deploy to apply.")).toBeVisible();
  await page.keyboard.press("Escape");
  // A unit without a coder in the draft
  await expect(page.getByText(/1 unit has no coder in the draft/)).toBeVisible();
  // Every column sorts
  await page.getByRole("button", { name: "Coder", exact: true }).click();
  await expect(page.getByRole("row").nth(1)).toContainText("anna");

  // Adding coders: one per line, with what was read before saving
  await page.getByRole("button", { name: "Add coders" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Coders, one per line/).fill("coder,email\ncarla; carla@uni.nl\nBOB");
  await expect(dialog.getByText("There is a coder with this id already")).toBeVisible();
  await dialog.getByLabel("The coder id is the email address").check();
  await dialog.getByLabel(/Email addresses, one per line/).fill("carla@uni.nl");
  await dialog.getByRole("button", { name: "Add 1 coder" }).click();
  await expect(dialog).toBeHidden();
  await expect(row("carla@uni.nl")).toContainText("carla@uni.nl");

  // An email address is set later; the id stays
  await row("anna").getByRole("button", { name: "Email address of anna" }).click();
  await dialog.getByLabel("Email address of anna").fill("anna@uni.nl");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(row("anna")).toContainText("anna@uni.nl");

  // Deleting a coder: gone from the table, and their deployed units have no coder
  await row("bob").getByRole("button", { name: "Delete bob" }).click();
  await expect(dialog.getByText(/leaves the coder set, deployed and in the draft/)).toBeVisible();
  await dialog.getByRole("button", { name: "Delete for good" }).click();
  await expect(dialog).toBeHidden();
  await expect(row("bob")).toHaveCount(0);
  await expect(page.getByText(/2 units have no coder, deployed and in the draft/)).toBeVisible();
  const coderSet = (await api<Groups>(request, "GET", `/study/${study.id}/sets?live=true`)).find(
    (g) => g.name === "coder_set",
  )!;
  expect(coderSet.sets.map((s) => s.name)).toEqual(["anna"]);
});
