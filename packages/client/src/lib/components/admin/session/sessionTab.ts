import { useSyncExternalStore } from "react";

/** The Study entry form's parts (SessionItemForm): who codes, the URL parameters, how the coding screen looks. */
export type SessionTab = "invite" | "urlParams" | "display";

// The open part, shared by the form and the buttons above the tree (SessionHeader), which open it on a part.
let current: SessionTab = "invite";
const listeners = new Set<() => void>();

function setSessionTab(tab: SessionTab): void {
  current = tab;
  listeners.forEach((l) => l());
}

export function useSessionTab(): [SessionTab, (tab: SessionTab) => void] {
  const tab = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  return [tab, setSessionTab];
}

/** Each part's name, as the buttons above the tree and the panel's header call it. */
export const SESSION_PART_LABELS: Record<SessionTab, string> = {
  invite: "Who codes",
  urlParams: "URL parameters",
  display: "Display",
};
