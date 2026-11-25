import { expect, test } from "./fixtures";
import type { StudyResponse, SetGroupResponse } from "@annotinder/contracts";
import { addCoders, answers, api, createStudy, list, question } from "./helpers";

// Sets and links (docs/architecture.md §6, docs/plans/unit-sets.md): columns
// of the CSV named like a role column (coder_set, test_set) are that
// column; with expert coders each coder_set value gets a link, and a coder
// gets their units, with the overlap units (test_set).

type Groups = SetGroupResponse[];
const counts = (groups: Groups, name: string) =>
  groups.find((g) => g.name === name)?.sets.map((s) => [s.name, s.unitIds.length]);

test("a coder_set column makes the coder set; a link per coder; a coder codes their units and the overlap units", async ({
  page,
  request,
  browser,
}) => {
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /Empty study/ }).click();
  await createStudy(page, "Expert coders", "Expert coders");
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  const study = (await list<StudyResponse>(request, "/study")).find((j) => j.name === "Expert coders")!;
  // The coders the file's coder_set column names
  await addCoders(request, study.id, ["s1", "s2"]);

  // Units, with role columns: their names say what they are
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "articles.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,text,coder_set,test_set\nu1,First text,s1,\nu2,Second text,s2,\nu3,Shared text,,overlap\n"),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByRole("button", { name: /Upload 3 units/ }).click();
  await expect(page.getByRole("button", { name: /^s2 1$/ })).toBeVisible();
  const groups = await api<Groups>(request, "GET", `/study/${study.id}/sets`);
  expect(counts(groups, "coder_set")).toEqual([
    ["s1", 1],
    ["s2", 1],
  ]);
  expect(counts(groups, "test_set")).toEqual([["overlap", 1]]);

  // Expert coders: a link each, with the overlap units first
  const codebook = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "per_coder" } },
    items: [
      {
        type: "unit_loop",
        id: "loop_1",
        units: { overlap: "before" },
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
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: codebook.id });

  // The Links page lists a link per coder
  await page.getByRole("navigation", { name: "Study" }).getByRole("button", { name: "Deploy", exact: true }).click();
  await page.getByRole("button", { name: "Links", exact: true }).click();
  await expect(page.getByRole("cell", { name: "coder s1" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "coder s2" })).toBeVisible();
  const links = await list<{ secret: string; params: Record<string, string> }>(request, `/study/${study.id}/links`);
  const s2 = links.find((l) => l.params.coder === "s2")!;

  // A coder with the s2 link: the overlap unit, then their own
  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/code/${study.publicId}?link=${s2.secret}`);
  for (const text of ["Shared text", "Second text"]) {
    await question(coder, "Topic?");
    await expect(coder.getByText(text)).toBeVisible();
    await coder.getByRole("button", { name: /politics/ }).click();
  }
  await expect(coder.getByText(/completed|Thank you/i).first()).toBeVisible();
  await expect.poll(async () => (await answers(request, study.id)).length).toBe(2);

  // More units, without the role columns: added to the coder set on request (the test units stay)
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "more.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,text\nu4,Fourth text\nu5,Fifth text\n"),
  });
  await expect(page.getByLabel("New units in test_set")).toHaveCount(0);
  await page.getByLabel("New units in coder_set").selectOption("distribute");
  await page.getByRole("button", { name: /Upload 2 units/ }).click();
  await expect
    .poll(async () => {
      const after = await api<Groups>(request, "GET", `/study/${study.id}/sets`);
      return [counts(after, "coder_set"), counts(after, "test_set")];
    })
    .toEqual([
      [
        ["s1", 2],
        ["s2", 2],
      ],
      [["overlap", 1]],
    ]);
});
