import { createContext, useContext } from "react";

export interface CoderSettingsContextValue {
  /** The theme shown: the coder's choice, or the study's. */
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  /** The study shows one theme for everyone (its display setting): the coder can't choose. */
  themeLocked: boolean;
  lockTheme: (theme: "light" | "dark" | null) => void;
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;
  /** Which keys choose answers (keyboard/mappings.ts `MappingId`). */
  keyMapping: string;
  setKeyMapping: (id: string) => void;
}

export const CoderSettingsContext = createContext<CoderSettingsContextValue | null>(null);

export function useCoderSettings(): CoderSettingsContextValue {
  const ctx = useContext(CoderSettingsContext);
  if (!ctx) {
    // Graceful fallback if rendered outside provider (e.g. in standalone tests)
    return {
      theme: "light",
      setTheme: () => {},
      themeLocked: false,
      lockTheme: () => {},
      showShortcuts: true,
      setShowShortcuts: () => {},
      keyMapping: "numbers",
      setKeyMapping: () => {},
    };
  }
  return ctx;
}
