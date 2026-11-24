import { beforeEach, describe, expect, it } from "vitest";
import { backupKeeper, clearBackup, readBackup, writeBackup, type DesignBackup } from "./localBackup";

const store = new Map<string, string>();
let full = false;
beforeEach(() => {
  store.clear();
  full = false;
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
});

const backup = (studyId: number, designVersionId: number | null, at = 1): DesignBackup => ({
  studyId,
  designVersionId,
  revision: 2,
  items: [],
  saved: [],
  at,
});

describe("local backup", () => {
  it("keeps a backup per study: editing one study leaves another's", () => {
    writeBackup(backup(1, 5));
    writeBackup(backup(2, 9));
    expect(readBackup(1)).toMatchObject({ studyId: 1, designVersionId: 5, revision: 2 });
    expect(readBackup(2)).toMatchObject({ studyId: 2, designVersionId: 9 });
    clearBackup(2);
    expect(readBackup(2)).toBeNull();
    expect(readBackup(1)).not.toBeNull();
  });

  it("without a study, reads the last one written and clears them all", () => {
    store.set("other", "{}");
    writeBackup(backup(1, 5, 10));
    writeBackup(backup(2, 9, 30));
    writeBackup(backup(3, 9, 20));
    expect(readBackup()).toMatchObject({ studyId: 2 });
    clearBackup();
    expect(readBackup()).toBeNull();
    expect(store.has("other")).toBe(true);
  });

  it("has no backup when storage is full, rather than an outdated one", () => {
    writeBackup(backup(1, 5));
    full = true;
    writeBackup({ ...backup(1, 5), at: 2 });
    expect(readBackup(1)).toBeNull();
  });
});

describe("an editor's backup", () => {
  it("leaves a backup it didn't write: opening the editor doesn't delete what is still on offer", () => {
    writeBackup(backup(1, 5));
    const keeper = backupKeeper(1, false);
    keeper.clear();
    expect(readBackup(1)).not.toBeNull();
  });

  it("clears the backup it wrote, once", () => {
    const keeper = backupKeeper(1, false);
    keeper.write(backup(1, 5));
    keeper.clear();
    expect(readBackup(1)).toBeNull();
    // Another tab's, written since: not this editor's
    writeBackup(backup(1, 5));
    keeper.clear();
    expect(readBackup(1)).not.toBeNull();
  });

  it("clears the backup it was started from", () => {
    writeBackup(backup(1, 5));
    backupKeeper(1, true).clear();
    expect(readBackup(1)).toBeNull();
  });
});
