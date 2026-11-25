import { useEffect, useRef } from "react";
import type { StudyManagerSnapshot } from "../../studyManager/types";
import { positionOf } from "./hooks";

/**
 * The browser's Back and Forward follow the coding screen's own (docs/client.md
 * §4 "Browser history"). Each place the coder gets to has one history entry
 * (same URL, the router's state plus a small marker); a `Trail` remembers the place of each, and
 * which one is shown.
 */
export interface Trail {
  keys: string[];
  index: number;
}

export const startTrail = (key: string): Trail => ({ keys: [key], index: 0 });

/** The trail after the coder got to `key`; null if its entry is the one shown already (nothing to add). */
export function recordPlace(trail: Trail, key: string): Trail | null {
  if (trail.keys[trail.index] === key) return null;
  const keys = [...trail.keys.slice(0, trail.index + 1), key];
  return { keys, index: keys.length - 1 };
}

/** The trail after the browser moved to entry `index`, and how many steps that is (negative: back); null for an entry that isn't of this trail. */
export function moveTo(trail: Trail, index: number | null): { trail: Trail; steps: number } | null {
  if (index === null || index < 0 || index >= trail.keys.length) return null;
  return { trail: { ...trail, index }, steps: index - trail.index };
}

const MARKER = "codingStep";

export const markerOf = (index: number) => ({ [MARKER]: index });

export function indexOfMarker(state: unknown): number | null {
  const index = (state as Record<string, unknown> | null)?.[MARKER];
  return typeof index === "number" ? index : null;
}

/** Where the coder is, as a history key; null where there is no question (loading, error, the end). */
export function historyKey(snapshot: StudyManagerSnapshot): string | null {
  const onQuestion = snapshot.phase === "user_variable" || snapshot.phase === "unit_variable";
  return onQuestion ? String(positionOf(snapshot.navigation)) : null;
}

interface BrowserHistoryOptions {
  /** False in a preview: the browser's history is left alone. */
  enabled: boolean;
  key: string | null;
  /** The screen's own back and forward. */
  onBack: () => void;
  onForward: () => void;
}

/**
 * Pushes an entry whenever the coder gets to a new place, and answers the
 * browser's Back and Forward with the screen's own. Returns the screen's back
 * and forward as the buttons and keys should call them: through the history
 * where an entry is there to go to (so that it stays in step), else directly.
 * On the first question there is no entry before: Back leaves the page.
 */
export function useBrowserHistory({ enabled, key, onBack, onForward }: BrowserHistoryOptions) {
  const trail = useRef<Trail | null>(null);
  const latest = useRef({ onBack, onForward });
  useEffect(() => {
    latest.current = { onBack, onForward };
  });

  useEffect(() => {
    if (!enabled || key === null) return;
    const current = trail.current;
    if (!current) {
      trail.current = startTrail(key);
      window.history.replaceState({ ...window.history.state, ...markerOf(0) }, "");
      return;
    }
    const next = recordPlace(current, key);
    if (!next) return;
    trail.current = next;
    window.history.pushState({ ...window.history.state, ...markerOf(next.index) }, "");
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled) return;
    const onPop = (event: PopStateEvent) => {
      const moved = trail.current && moveTo(trail.current, indexOfMarker(event.state));
      if (!moved) return;
      trail.current = moved.trail;
      const step = moved.steps < 0 ? latest.current.onBack : latest.current.onForward;
      for (let i = 0; i < Math.abs(moved.steps); i++) step();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled]);

  return {
    back: () => (enabled && trail.current && trail.current.index > 0 ? window.history.back() : onBack()),
    forward: () =>
      enabled && trail.current && trail.current.index < trail.current.keys.length - 1
        ? window.history.forward()
        : onForward(),
  };
}
