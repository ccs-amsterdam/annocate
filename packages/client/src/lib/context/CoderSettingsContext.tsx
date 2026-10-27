import React, { createContext, useContext, useState } from "react";
import { useTheme } from "./theme";

export interface CoderSettingsContextValue {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;
}

const CoderSettingsContext = createContext<CoderSettingsContextValue | null>(null);

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

export function CoderSettingsProvider({ children }: { children: React.ReactNode }) {
  // Shared with the researcher UI (theme.ts).
  const [theme, setTheme] = useTheme();

  const [showShortcuts, setShowShortcutsState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("annocate_show_shortcuts");
    return saved !== "false";
  });

  function setShowShortcuts(s: boolean) {
    setShowShortcutsState(s);
    localStorage.setItem("annocate_show_shortcuts", String(s));
  }

  return (
    <CoderSettingsContext.Provider value={{ theme, setTheme, showShortcuts, setShowShortcuts }}>
      {children}
    </CoderSettingsContext.Provider>
  );
}
