import type { TopLevelItem } from "@annotinder/contracts";

// A copy of unsaved design edits in the browser's localStorage, so a
// closed tab or crashed browser doesn't lose them (docs/client.md §7). There
// is one backup per study: the design being edited there. It is cleared when
// the edits are saved or discarded. Too large to store (localStorage holds a
// few MB): then there is no backup.

const STORAGE_PREFIX = "annotinder:design-backup:";
const storageKey = (studyId: number) => `${STORAGE_PREFIX}${studyId}`;

export interface DesignBackup {
  studyId: number;
  /** The version being edited; null for a new design. */
  designVersionId: number | null;
  /** The saved revision the edits are based on (for the save conflict check). */
  revision?: number;
  /** The edited items, and the items as last saved (both with editor keys, for changed marks and revert). */
  items: TopLevelItem[];
  saved: TopLevelItem[];
  /** When the backup was written (ms). */
  at: number;
}

/** The backup stored under a key; null if there is none, or it isn't one. */
function backupAt(key: string): DesignBackup | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const backup = JSON.parse(raw) as DesignBackup;
    return typeof backup.studyId === "number" && Array.isArray(backup.items) && Array.isArray(backup.saved)
      ? backup
      : null;
  } catch {
    return null;
  }
}

/** The keys of every study's backup in this browser. */
function backupKeys(): string[] {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    return keys.filter((key): key is string => key !== null && key.startsWith(STORAGE_PREFIX));
  } catch {
    return [];
  }
}

/** A study's backup; without a study, the last one written in this browser. */
export function readBackup(studyId?: number): DesignBackup | null {
  if (studyId !== undefined) return backupAt(storageKey(studyId));
  const backups = backupKeys().flatMap((key) => backupAt(key) ?? []);
  return backups.sort((a, b) => b.at - a.at)[0] ?? null;
}

export function writeBackup(backup: DesignBackup): void {
  try {
    localStorage.setItem(storageKey(backup.studyId), JSON.stringify(backup));
  } catch {
    // Full or unavailable (e.g. private mode): no backup, and don't keep an outdated one.
    clearBackup(backup.studyId);
  }
}

/** Clears a study's backup; without a study, every backup in this browser. */
export function clearBackup(studyId?: number): void {
  try {
    const keys = studyId !== undefined ? [storageKey(studyId)] : backupKeys();
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // localStorage unavailable: nothing to clear.
  }
}

/**
 * One open editor's hold on its study's backup. It clears only a backup
 * that is its own: one it wrote, or the one it started from (`restored`).
 * A backup of an earlier session that is still on offer stays until then.
 */
export interface BackupKeeper {
  write: (backup: DesignBackup) => void;
  /** The edits are saved or undone: its backup is no longer needed. */
  clear: () => void;
}

export function backupKeeper(studyId: number, restored: boolean): BackupKeeper {
  let own = restored;
  return {
    write(backup) {
      writeBackup(backup);
      own = true;
    },
    clear() {
      if (own) clearBackup(studyId);
      own = false;
    },
  };
}
