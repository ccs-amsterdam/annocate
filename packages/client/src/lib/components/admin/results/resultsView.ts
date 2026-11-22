import { useSyncExternalStore } from "react";

/** The Results page's views, in tab order: the answers so far, the coders, and the download. */
export const RESULTS_VIEWS = ["Questions", "Agreement", "Units", "Coders", "Download"] as const;
export type ResultsView = (typeof RESULTS_VIEWS)[number];

// The open view, shared so other pages (the overview's coder counts) can open Results on one
let current: ResultsView = "Questions";
const listeners = new Set<() => void>();

export function setResultsView(view: ResultsView): void {
  current = view;
  listeners.forEach((l) => l());
}

export function useResultsView(): [ResultsView, (view: ResultsView) => void] {
  const view = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  return [view, setResultsView];
}
