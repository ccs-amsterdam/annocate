import { createContext } from "react";
import type { KeyController } from "./controller";
import type { KeyMapping } from "./mappings";

/** The coding screen's keyboard: its controller and the coder's mapping (KeyboardProvider). */
export interface KeyboardState {
  controller: KeyController;
  mapping: KeyMapping;
}

export const KeyboardContext = createContext<KeyboardState | null>(null);
