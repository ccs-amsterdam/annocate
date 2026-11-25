import { useSyncExternalStore } from "react";

/** The Results page's views, in tab order: the answers so far, the coders, and the download. */
export const RESULTS_VIEWS = ["Questions", "Agreement", "Units", "Coders", "Download"] as const;
export type ResultsView = (typeof RESULTS_VIEWS)[number];

// The open view, kept while the researcher is on other pages
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
