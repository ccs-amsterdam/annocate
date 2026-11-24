import { useSyncExternalStore } from "react";

// What the keyboard last chose (`useKeyTargets`): shown for a moment
// (`KeyChoiceFlash`), so a coder who pressed the wrong key sees it, also when
// the question moves on at once.

export interface KeyChoice {
  /** The key pressed (or typed letters), and the answer it chose. */
  key: string;
  label: string;
  /** Counts up, so the same answer twice shows twice. */
  n: number;
}

let current: KeyChoice | null = null;
let count = 0;
const listeners = new Set<() => void>();

export function showKeyChoice(key: string, label: string): void {
  current = { key, label, n: ++count };
  listeners.forEach((l) => l());
}

export function useKeyChoice(): KeyChoice | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
