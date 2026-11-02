import type { TopLevelItem } from "@annotinder/contracts";

// A copy of unsaved design edits in the browser's localStorage, so a
// closed tab or crashed browser doesn't lose them (docs/client.md §7). There
// is one backup at a time: the codebook being edited. It is cleared when the
// edits are saved or discarded. Too large to store (localStorage holds a few
// MB): then there is no backup.

const STORAGE_KEY = "annotinder:design-backup";

export interface DesignBackup {
  jobId: number;
  /** The version being edited; null for a new codebook. */
  designVersionId: number | null;
  /** The saved revision the edits are based on (for the save conflict check). */
  revision?: number;
  /** The edited items, and the items as last saved (both with editor keys, for changed marks and revert). */
  items: TopLevelItem[];
  saved: TopLevelItem[];
  /** When the backup was written (ms). */
  at: number;
}

export function readBackup(): DesignBackup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const backup = JSON.parse(raw) as DesignBackup;
    return typeof backup.jobId === "number" && Array.isArray(backup.items) && Array.isArray(backup.saved) ? backup : null;
  } catch {
    return null;
  }
}

export function writeBackup(backup: DesignBackup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
  } catch {
    // Full or unavailable (e.g. private mode): no backup, and don't keep an outdated one.
    clearBackup();
  }
}

/** Clears the backup; with a job and codebook, only if it is theirs. */
export function clearBackup(of?: { jobId: number; designVersionId: number | null }): void {
  try {
    if (of) {
      const backup = readBackup();
      if (!backup || backup.jobId !== of.jobId || backup.designVersionId !== of.designVersionId) return;
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable: nothing to clear.
  }
}
