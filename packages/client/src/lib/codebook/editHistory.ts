import type { TopLevelItem } from "@annotinder/contracts";
import { deleteItem, updateItem } from "./codebookEdit";
import { findItem, flattenTree, keyOf } from "./tree";

// Undo/redo and "what changed since the last save" for the codebook editor
// (docs/client.md §7). The editor keeps whole snapshots of the items: the
// updates are immutable, so unchanged items are shared between snapshots and
// keeping 100 of them is cheap.

/** Changes within this many ms of the previous one are one undo step (e.g. typing a word). */
export const STEP_GROUP_MS = 1000;
export const HISTORY_LIMIT = 100;

export interface EditHistory<T> {
  /** Earlier states, oldest first. */
  past: T[];
  /** States undone, the next to redo last. */
  future: T[];
  /** When the last change was recorded (ms). */
  last: number;
}

export function emptyHistory<T>(): EditHistory<T> {
  return { past: [], future: [], last: 0 };
}

/**
 * Records a change from `current`: it becomes an undo step, unless the
 * previous change was less than `STEP_GROUP_MS` ago (then both are one
 * step). A change clears what could be redone.
 */
export function recordChange<T>(history: EditHistory<T>, current: T, now: number): EditHistory<T> {
  const grouped = now - history.last < STEP_GROUP_MS && history.past.length > 0;
  const past = grouped ? history.past : [...history.past, current].slice(-HISTORY_LIMIT);
  return { past, future: [], last: now };
}

/** The state before the last step, and the history after undoing it; null if there is nothing to undo. */
export function undo<T>(history: EditHistory<T>, current: T): { value: T; history: EditHistory<T> } | null {
  if (history.past.length === 0) return null;
  return {
    value: history.past[history.past.length - 1],
    history: { past: history.past.slice(0, -1), future: [...history.future, current], last: 0 },
  };
}

export function redo<T>(history: EditHistory<T>, current: T): { value: T; history: EditHistory<T> } | null {
  if (history.future.length === 0) return null;
  return {
    value: history.future[history.future.length - 1],
    history: { past: [...history.past, current], future: history.future.slice(0, -1), last: 0 },
  };
}

/** An item's own content (without its children and editor key), to compare versions of it. */
function ownContent(item: object): string {
  const own: Record<string, unknown> = { ...item };
  delete own.children;
  delete own._key;
  return JSON.stringify(own);
}

/** Keys of the items that are new or changed since `saved` (moves alone don't count). */
export function changedKeys(items: TopLevelItem[], saved: TopLevelItem[]): Set<string> {
  const before = new Map<string, string>();
  for (const item of flattenTree(saved)) {
    const key = keyOf(item);
    if (key) before.set(key, ownContent(item));
  }
  const changed = new Set<string>();
  for (const item of flattenTree(items)) {
    const key = keyOf(item);
    if (key && before.get(key) !== ownContent(item)) changed.add(key);
  }
  return changed;
}

/**
 * The items with one item back as it was saved (its own content; its
 * children keep their own changes). An item that is new since the save is
 * removed.
 */
export function revertItem(items: TopLevelItem[], saved: TopLevelItem[], key: string): TopLevelItem[] {
  const current = findItem(items, key);
  if (!current) return items;
  const before = findItem(saved, key);
  if (!before) return deleteItem(items, key);
  // updateItem merges, so fields the saved item didn't have are cleared explicitly.
  const reverted: Record<string, unknown> = {};
  for (const field of Object.keys(current)) if (field !== "children" && field !== "_key") reverted[field] = undefined;
  for (const [field, value] of Object.entries(before)) if (field !== "children") reverted[field] = value;
  return updateItem(items, key, reverted as unknown as Parameters<typeof updateItem>[2]);
}
