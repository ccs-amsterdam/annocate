import type {
  DesignVersion,
  DesignVersionMeta,
  SetGroupResponse,
  StudyResponse,
  UnitPage,
} from "@annotinder/contracts";
import { expect, test } from "./fixtures";
import { api, fromExample } from "./helpers";

// A study from a design file: Create new study › From a file.

/** What makes a study, to compare a copy with its original. */
async function contents(request: Parameters<typeof api>[0], id: number) {
  const study = await api<StudyResponse>(request, "GET", `/study/${id}`);
  const page = await api<UnitPage>(request, "GET", `/study/${id}/units/page?offset=0&limit=200`);
  const ids = new Map(page.units.map((u) => [u.id, u.externalId]));
  const groups = await api<SetGroupResponse[]>(request, "GET", `/study/${id}/sets`);
  const versions = await api<DesignVersionMeta[]>(request, "GET", `/study/${id}/design`);
  const design = await api<DesignVersion>(request, "GET", `/study/${id}/design/${versions.at(-1)!.id}`);
  return {
    settings: { signIn: study.signIn, keepSessionsOpen: study.keepSessionsOpen, redirectUrls: study.redirectUrls },
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
  const versions = await api<DesignVersionMeta[]>(request, "GET", `/study/${study.id}/design`);
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
  const input = dialog.getByLabel("Design file");
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
  await expect(page).toHaveURL(/\/research\/studies\/\d+\/editor/);
  const id = Number(/\/research\/studies\/(\d+)/.exec(page.url())![1]);
  const copy = await contents(request, id);
  expect(copy.units).toEqual([]);
  expect(copy.design.items).toEqual(design.items);
  expect(copy.design.units).toEqual(design.units);
});
