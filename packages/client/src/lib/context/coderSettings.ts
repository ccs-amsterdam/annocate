import { createContext, useContext } from "react";

export interface CoderSettingsContextValue {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;
}

export const CoderSettingsContext = createContext<CoderSettingsContextValue | null>(null);

export function useCoderSettings(): CoderSettingsContextValue {
  const ctx = useContext(CoderSettingsContext);
  if (!ctx) {
    // Graceful fallback if rendered outside provider (e.g. in standalone tests)
    return {
      theme: "light",
      setTheme: () => {},
      showShortcuts: true,
      setShowShortcuts: () => {},
    };
  }
  return ctx;
}
