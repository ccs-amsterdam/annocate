import { useSyncExternalStore } from "react";
import { GUIDE_TOPICS } from "./guideSteps";

// The guide's state: one guide for the researcher UI (`GuideDialog`, mounted
// by AdminApp), opened from anywhere with `openGuide`. The full guide walks
// all topics in order and remembers where it was (in this browser); "Show
// me" closes the dialog and points at a real element (`ShowMe`).

export interface GuideState {
  topic: string;
  step: number;
  /** The full guide: Next goes on to the next topic. */
  full: boolean;
}

export interface ShowMeTarget {
  /** The `data-guide` name of the element. */
  target: string;
  label: string;
  /** Where the guide was: Back to the guide returns there. */
  from: GuideState;
}

const FULL_KEY = "annotinder.guide.full";

let guide: GuideState | null = null;
let showMe: ShowMeTarget | null = null;
/** The researcher made their first study: asked whether to take the guide (`GuidePrompt`). */
let prompt = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function remember(state: GuideState) {
  if (!state.full) return;
  try {
    localStorage.setItem(FULL_KEY, JSON.stringify({ topic: state.topic, step: state.step }));
  } catch {
    // No storage: the full guide starts from the beginning next time
  }
}

/** Where the full guide was left (null: not started, or finished). */
export function fullGuideProgress(): { topic: string; step: number } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(FULL_KEY) ?? "null") as { topic?: unknown; step?: unknown } | null;
    if (saved && typeof saved.topic === "string" && GUIDE_TOPICS.some((t) => t.id === saved.topic))
      return { topic: saved.topic, step: typeof saved.step === "number" ? saved.step : 0 };
  } catch {
    // Nothing kept
  }
  return null;
}

/** Opens the guide on a topic; `full`: the full guide, from where it was left unless `fromStart`. */
export function openGuide(topic?: string, options: { full?: boolean; fromStart?: boolean } = {}): void {
  const full = options.full ?? false;
  const resume = full && !options.fromStart && topic === undefined ? fullGuideProgress() : null;
  guide = resume
    ? { ...resume, full }
    : { topic: topic ?? GUIDE_TOPICS[0].id, step: 0, full };
  showMe = null;
  remember(guide);
  emit();
}

export function setGuide(state: GuideState): void {
  guide = state;
  remember(state);
  emit();
}

/** Closes the guide; `finished`: the full guide got to its end. */
export function closeGuide(finished = false): void {
  if (finished)
    try {
      localStorage.removeItem(FULL_KEY);
    } catch {
      // Nothing kept
    }
  guide = null;
  emit();
}

/** Closes the guide and points at an element on the page. */
export function startShowMe(target: Omit<ShowMeTarget, "from">): void {
  if (!guide) return;
  showMe = { ...target, from: guide };
  guide = null;
  emit();
}

/** Stops pointing; `back`: to the guide where it was. */
export function endShowMe(back = false): void {
  if (back && showMe) guide = showMe.from;
  showMe = null;
  emit();
}

export function useGuide(): GuideState | null {
  return useSyncExternalStore(
    subscribe,
    () => guide,
    () => null,
  );
}

export function useShowMe(): ShowMeTarget | null {
  return useSyncExternalStore(
    subscribe,
    () => showMe,
    () => null,
  );
}

/** Asks, once the study opens, whether to take the full guide (after a researcher's first study). */
export function requestGuidePrompt(): void {
  prompt = true;
  emit();
}

/** The answer to the prompt: yes starts the full guide from the beginning. */
export function answerGuidePrompt(yes: boolean): void {
  prompt = false;
  if (yes) openGuide(undefined, { full: true, fromStart: true });
  else emit();
}

export function useGuidePrompt(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => prompt,
    () => false,
  );
}
