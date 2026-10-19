import { describe, expect, it } from "vitest";
import type { CodebookMeta } from "@annotinder/contracts";
import { describeVersions } from "./versions";

const meta = (id: number, immutable: boolean): CodebookMeta => ({ id, note: null, created: new Date(), immutable });

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

  it("has no current version without codebooks", () => {
    expect(describeVersions([], null).currentId).toBeNull();
  });
});
