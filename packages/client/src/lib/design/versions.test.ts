import { describe, expect, it } from "vitest";
import type { DesignVersionMeta } from "@annotinder/contracts";
import { describeVersions, draftMadeMeanwhile, editorMode } from "./versions";

const meta = (id: number, immutable: boolean): DesignVersionMeta => ({
  id,
  note: null,
  created: new Date(),
  updated: new Date(),
  updatedBy: null,
  revision: 1,
  immutable,
  valid: true,
});

describe("describeVersions", () => {
  it("treats a mutable latest version as the draft", () => {
    const v = describeVersions([meta(1, true), meta(2, false)], 1);
    expect(v).toMatchObject({ liveId: 1, draftId: 2, currentId: 2 });
    expect(v.statusOf(1)).toBe("live");
    expect(v.statusOf(2)).toBe("draft");
    expect(v.numberOf(2)).toBe(2);
  });

  it("opens the live version when there is no draft", () => {
    const v = describeVersions([meta(1, true), meta(2, true)], 2);
    expect(v).toMatchObject({ liveId: 2, draftId: null, currentId: 2 });
    expect(v.statusOf(1)).toBe("history");
  });

  it("has a draft but nothing live before the first publish", () => {
    const v = describeVersions([meta(1, false)], null);
    expect(v).toMatchObject({ liveId: null, draftId: 1, currentId: 1 });
  });

  it("treats older unpublished versions as history", () => {
    const v = describeVersions([meta(1, false), meta(2, true), meta(3, false)], 2);
    expect(v.statusOf(1)).toBe("history");
    expect(v.draftId).toBe(3);
  });

  it("has no current version without design versions", () => {
    expect(describeVersions([], null).currentId).toBeNull();
  });
});

describe("editorMode", () => {
  const list = [meta(1, true), meta(2, false)];
  const versions = describeVersions(list, 1);

  it("edits the draft, and the live version when there is no draft; a new design is a draft", () => {
    expect(editorMode({ id: 2, immutable: false, pinned: false }, versions)).toBe("draft");
    expect(editorMode({ id: 1, immutable: true, pinned: false }, describeVersions([meta(1, true)], 1))).toBe("live");
    expect(editorMode({ id: null, pinned: false }, describeVersions([], null))).toBe("draft");
  });

  it("shows any other version read only", () => {
    expect(editorMode({ id: 1, immutable: true, pinned: false }, versions)).toBe("history");
  });

  it("takes a version that isn't listed yet for the one just made", () => {
    expect(editorMode({ id: 3, immutable: false, pinned: false }, versions)).toBe("draft");
  });

  it("keeps a version with unsaved edits editable when a draft is made elsewhere", () => {
    expect(editorMode({ id: 1, immutable: true, pinned: true }, versions)).toBe("live");
  });
});

describe("draftMadeMeanwhile", () => {
  const list = [meta(1, true), meta(2, false)];
  const versions = describeVersions(list, 1);

  it("is the draft that passed by the version being edited", () => {
    expect(draftMadeMeanwhile({ id: 1, immutable: true, pinned: true }, list, versions)).toBe(list[1]);
    // A new design, while someone else saved the first version
    const first = [meta(1, false)];
    expect(draftMadeMeanwhile({ id: null, pinned: true }, first, describeVersions(first, null))).toBe(first[0]);
  });

  it("is none for the draft itself, without unsaved edits, or without a draft", () => {
    expect(draftMadeMeanwhile({ id: 2, immutable: false, pinned: true }, list, versions)).toBeNull();
    expect(draftMadeMeanwhile({ id: 1, immutable: true, pinned: false }, list, versions)).toBeNull();
    const deployed = [meta(1, true), meta(2, true)];
    expect(
      draftMadeMeanwhile({ id: 1, immutable: true, pinned: true }, deployed, describeVersions(deployed, 2)),
    ).toBeNull();
  });
});
