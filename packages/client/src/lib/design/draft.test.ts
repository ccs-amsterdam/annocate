import { describe, expect, it } from "vitest";
import type { DesignVersion, DesignVersionMeta, TopLevelItem } from "@annotinder/contracts";
import { flattenTree, keyOf } from "../codebook/tree";
import { saveRequest, startDraft } from "./draft";
import { changedKeys } from "./editHistory";
import { stripKeys } from "./itemEdit";
import type { DesignBackup } from "./localBackup";

const question = (name: string, text = "?") =>
  ({ type: "question", name, variable: { type: "confirm", question: text } }) as unknown as TopLevelItem;

const meta = (id: number, immutable: boolean, revision = 1): DesignVersionMeta => ({
  id,
  note: null,
  created: new Date(0),
  updated: new Date(1000),
  updatedBy: "ann@example.org",
  revision,
  immutable,
  valid: true,
});

const version = (id: number, immutable: boolean, items: TopLevelItem[], revision = 1): DesignVersion => ({
  ...meta(id, immutable, revision),
  studyId: 1,
  items,
  units: { fields: [] },
  session: { urlParams: [{ name: "wave" }] },
  public: { title: "News" },
});

/** Edits of `of`, left in the browser: the question `a` reworded. */
function backupOf(of: DesignVersion | null, revision?: number): DesignBackup {
  const saved = startDraft(of).items;
  const items = saved.map((i) => (i.type === "question" && i.name === "a" ? { ...i, ...question("a", "Edited?") } : i));
  return { studyId: 1, designVersionId: of?.id ?? null, revision, items, saved, at: 5 };
}

const names = (items: TopLevelItem[]) => flattenTree(items).map((i) => ("name" in i ? i.name : i.type));

describe("startDraft", () => {
  it("starts from the version: the Study entry first, every item with a key, nothing changed", () => {
    const draft = startDraft(version(3, false, [question("a")], 4));
    expect(names(draft.items)).toEqual(["session", "a"]);
    expect(draft.items[0]).toMatchObject({ urlParams: [{ name: "wave" }], public: { title: "News" } });
    expect(flattenTree(draft.items).every((i) => keyOf(i))).toBe(true);
    expect(draft.saved).toBe(draft.items);
    expect(draft.revision).toBe(4);
  });

  it("starts a new design with only the Study entry", () => {
    const draft = startDraft(null);
    expect(names(draft.items)).toEqual(["session"]);
    expect(draft.revision).toBeUndefined();
  });

  it("continues a backup of the same version as it was left: its edits, what was saved, its revision", () => {
    const open = version(3, false, [question("a"), question("b")], 7);
    const backup = backupOf(open, 6);
    const draft = startDraft(open, backup);
    expect(draft.items).toEqual(backup.items);
    expect(draft.saved).toEqual(backup.saved);
    // The revision the edits were based on: saving says so if someone saved since
    expect(draft.revision).toBe(6);
    expect([...changedKeys(draft.items, draft.saved)]).toEqual([keyOf(draft.items[1])]);
  });

  it("continues a backup of another version on the open one: as edits of what that has saved", () => {
    const live = version(1, true, [question("a"), question("b")]);
    const backup = backupOf(live, 1);
    // Since then a draft was made, with another question
    const draftVersion = version(2, false, [question("a"), question("b"), question("c")], 3);
    const draft = startDraft(draftVersion, backup);
    expect(stripKeys(draft.items)).toEqual(stripKeys(backup.items));
    expect(names(draft.saved)).toEqual(["session", "a", "b", "c"]);
    expect(draft.revision).toBe(3);
    // The same items keep their keys, so only the edited one counts as changed
    expect([...changedKeys(draft.items, draft.saved)]).toEqual([keyOf(draft.items[1])]);
  });
});

describe("saveRequest", () => {
  const items = startDraft(version(2, false, [question("a")])).items;
  const design = { items: [question("a")], session: { urlParams: [{ name: "wave" }] }, public: { title: "News" } };

  it("updates a draft, with the revision the edits are based on and without editor keys", () => {
    const open = { ...version(2, false, []), note: "Wave 2" };
    expect(saveRequest({ items, version: open, revision: 4, overwrite: false })).toEqual({
      update: 2,
      body: { note: "Wave 2", ...design, revision: 4 },
    });
  });

  it("saves over what someone else saved: no revision", () => {
    const request = saveRequest({ items, version: version(2, false, []), revision: 4, overwrite: true });
    expect(request).toMatchObject({ update: 2, body: { revision: undefined } });
  });

  it("makes a new version for a new design, and for edits of the live version", () => {
    expect(saveRequest({ items, version: null, revision: undefined, overwrite: false })).toEqual({ create: design });
    expect(saveRequest({ items, version: version(1, true, []), revision: 1, overwrite: false })).toEqual({
      create: design,
    });
  });

  it("asks before saving past a draft someone else made meanwhile", () => {
    const request = saveRequest({
      items,
      version: version(1, true, []),
      revision: 1,
      newerDraft: meta(2, false, 5),
      overwrite: false,
    });
    expect(request).toEqual({
      conflict: {
        error: "ann@example.org saved a draft since you opened this design",
        code: "design_conflict",
        updated: new Date(1000),
        updatedBy: "ann@example.org",
        revision: 5,
      },
    });
  });

  it("saves over that draft when told to: an update of it, not a third version", () => {
    const request = saveRequest({
      items,
      version: version(1, true, []),
      revision: 1,
      newerDraft: meta(2, false, 5),
      overwrite: true,
    });
    expect(request).toEqual({ update: 2, body: design });
  });
});
