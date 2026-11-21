import { createContext, useContext } from "react";

/**
 * How the coding screen looks (docs/client.md §4 "Display"): the study's
 * layouts (fixed or responsive) and theme, and the screen's width class.
 * Provided by the coding screen; elsewhere (the editor's previews) fixed.
 */
export interface DisplayState {
  layouts: "fixed" | "responsive";
  theme: "coder" | "light" | "dark";
  /** narrow: a phone; wide: more room (the question column is at most about 560 px). */
  width: "narrow" | "wide";
}

export const FIXED_DISPLAY: DisplayState = { layouts: "fixed", theme: "coder", width: "narrow" };

export const DisplayContext = createContext<DisplayState>(FIXED_DISPLAY);

export function useDisplay(): DisplayState {
  return useContext(DisplayContext);
}
