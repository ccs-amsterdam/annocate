import { beforeEach, describe, expect, it } from "vitest";
import { clearBackup, readBackup, writeBackup, type CodebookBackup } from "./localBackup";

const store = new Map<string, string>();
let full = false;
beforeEach(() => {
  store.clear();
  full = false;
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
});

const backup = (jobId: number, codebookId: number | null): CodebookBackup => ({ jobId, codebookId, revision: 2, items: [], saved: [], at: 1 });

describe("local backup", () => {
  it("keeps one backup, cleared only by its own codebook", () => {
    writeBackup(backup(1, 5));
    expect(readBackup()).toMatchObject({ jobId: 1, codebookId: 5, revision: 2 });
    clearBackup({ jobId: 1, codebookId: 6 });
    expect(readBackup()).not.toBeNull();
    clearBackup({ jobId: 1, codebookId: 5 });
    expect(readBackup()).toBeNull();
  });

  it("has no backup when storage is full, rather than an outdated one", () => {
    writeBackup(backup(1, 5));
    full = true;
    writeBackup({ ...backup(1, 5), at: 2 });
    expect(readBackup()).toBeNull();
  });
});
