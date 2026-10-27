import { useSyncExternalStore } from "react";

/** The unit loop form's tabs (UnitLoopForm). */
export type LoopTab = "layout" | "units";

// The open tab, shared by the form and the tree's loop buttons (which open
// a loop on a tab). It stays as it was when another loop is selected.
let current: LoopTab = "layout";
const listeners = new Set<() => void>();

export function setLoopTab(tab: LoopTab): void {
  current = tab;
  listeners.forEach((l) => l());
}

export function useLoopTab(): [LoopTab, (tab: LoopTab) => void] {
  const tab = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  return [tab, setLoopTab];
}
