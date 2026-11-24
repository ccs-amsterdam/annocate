import { createContext, useContext } from "react";
import type { NominalOption, SWIPE_DIRECTIONS } from "@annotinder/contracts";

export type SwipeDirection = (typeof SWIPE_DIRECTIONS)[number];

export interface SwipeState {
  /** The question the swipe answers (its key): a gesture or flight that outlasts it doesn't answer the next. */
  question: string;
  options: NominalOption[];
  /** Flies the card off in a direction (from where a drag let go), then answers with its option. */
  swipe: (direction: SwipeDirection, from?: { x: number; y: number }) => void;
  /** The card's element registers here, so `swipe` can animate it. */
  register: (card: HTMLDivElement | null) => void;
  /** The surface's overlay (the option's label) registers here. */
  registerOverlay: (overlay: HTMLDivElement | null) => void;
  /** The registered card and its overlay (dragged from the `SwipeSurface`). */
  card: () => HTMLDivElement | null;
  overlay: () => HTMLDivElement | null;
}

/**
 * Whether a press may start a swipe: not on a part of the surface with a
 * drag of its own (`data-no-swipe`: the answer pane's resize handle).
 */
export function startsSwipe(target: EventTarget | null): boolean {
  const element = target as Partial<Pick<Element, "closest">> | null;
  return !element?.closest?.("[data-no-swipe]");
}

export const SwipeContext = createContext<SwipeState | null>(null);

/** The swipe of the current question, if it is a swipe question with a card. */
export function useSwipe(): SwipeState | null {
  return useContext(SwipeContext);
}
