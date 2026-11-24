import type {
  DesignVersion,
  DesignVersionMeta,
  SetGroupResponse,
  StudyResponse,
  UnitPage,
} from "@annotinder/contracts";
import { expect, test } from "./fixtures";
import { answers, api, coders, fromExample, list } from "./helpers";

// Create new study › From a file: a copy of a study from its export
// (Settings › Export study), coders and answers included, and a study from a
// design file.

/** What makes a study, to compare a copy with its original. */
async function contents(request: Parameters<typeof api>[0], id: number) {
  const study = await api<StudyResponse>(request, "GET", `/study/${id}`);
  const page = await api<UnitPage>(request, "GET", `/study/${id}/units/page?offset=0&limit=200`);
  const ids = new Map(page.units.map((u) => [u.id, u.externalId]));
  const groups = await api<SetGroupResponse[]>(request, "GET", `/study/${id}/sets`);
  const versions = await list<DesignVersionMeta>(request, `/study/${id}/design`);
  const design = await api<DesignVersion>(request, "GET", `/study/${id}/design/${versions.at(-1)!.id}`);
  return {
    settings: { reopenMinutes: study.reopenMinutes, redirectUrls: study.redirectUrls },
    units: page.units.map((u) => [u.externalId, u.data]),
    sets: groups.map((g) => [g.name, g.sets.map((s) => [s.name, s.unitIds.map((u) => ids.get(u))])]),
    design: { items: design.items, session: design.session, units: design.units, public: design.public },
  };
}

test("a design file makes a study with that design and no units; other files are refused with a reason", async ({
  page,
  request,
}) => {
  const { study } = await fromExample(request, "swipe-sentiment");
  const versions = await list<DesignVersionMeta>(request, `/study/${study.id}/design`);
  const design = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${versions.at(-1)!.id}`);
  const file = {
    format: "annotinder-design",
    formatVersion: 1,
    client: { release: "0.1.0", commit: "unknown" },
    exportedAt: new Date().toISOString(),
    name: "Swiping",
    version: 1,
    note: null,
    design: { public: design.public, session: design.session, units: design.units, items: design.items },
  };

  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /From a file/ }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByLabel("Study export or design file");
  await input.setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"a":1}') });
  await expect(dialog.getByRole("alert")).toContainText("isn't an AnnoTinder design file");
  await expect(dialog.getByRole("button", { name: "Create study" })).toBeDisabled();

  await input.setInputFiles({
    name: "v1.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(dialog.getByTestId("import-summary")).toContainText("No units");
  await dialog.getByRole("button", { name: "Create study" }).click();
  await expect(page).toHaveURL(/\/research\/studies\/\d+\/design/);
  const id = Number(/\/research\/studies\/(\d+)/.exec(page.url())![1]);
  const copy = await contents(request, id);
  expect(copy.units).toEqual([]);
  expect(copy.design.items).toEqual(design.items);
  expect(copy.design.units).toEqual(design.units);
});

test("a study export makes a copy of the study, with its coders and answers, under new ids", async ({
  page,
  request,
}) => {
  const { study } = await fromExample(request, "swipe-sentiment");
  await page.goto(`/research/studies/${study.id}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export study" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.annotinder\.gz$/);
  const bytes = Buffer.concat(await (await download.createReadStream()).toArray());

  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /From a file/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Study export or design file").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/gzip",
    buffer: bytes,
  });
  await expect(dialog.getByTestId("import-summary")).toContainText(/3 coders with 30 answers/);
  await dialog.getByLabel("Study name").fill("Sentiment, moved");
  await dialog.getByRole("button", { name: "Create study" }).click();
  await expect(page).toHaveURL(/\/research\/studies\/\d+\/design/);
  const copyId = Number(/\/research\/studies\/(\d+)/.exec(page.url())![1]);
  expect(copyId).not.toBe(study.id);

  expect((await api<StudyResponse>(request, "GET", `/study/${copyId}`)).name).toBe("Sentiment, moved");
  expect(await contents(request, copyId)).toEqual(await contents(request, study.id));
  const [before, after] = [await coders(request, study.id), await coders(request, copyId)];
  expect(after.map((c) => c.coder)).toEqual(before.map((c) => c.coder));
  expect(after.map((c) => c.id).filter((id) => before.some((b) => b.id === id))).toEqual([]);
  expect((await answers(request, copyId)).length).toBe((await answers(request, study.id)).length);
});
