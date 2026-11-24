import { createContext } from "react";
import type { KeyController } from "./controller";
import type { KeyMapping } from "./mappings";

/** The coding screen's keyboard: its controller and the coder's mapping (KeyboardProvider). */
export interface KeyboardState {
  controller: KeyController;
  mapping: KeyMapping;
}

export const KeyboardContext = createContext<KeyboardState | null>(null);

/**
 * Whether answers take keys here (the coder turned answer shortcuts on, and
 * the study allows them for this question: its display setting). Off: no
 * keys or badges on answers; the arrows, Space / Enter and the Ctrl commands
 * still work. Outside the coding screen (previews): on.
 */
export const AnswerKeysContext = createContext<boolean>(true);
