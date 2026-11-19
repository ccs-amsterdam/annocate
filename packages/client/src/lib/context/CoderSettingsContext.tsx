import React, { useState } from "react";
import { CoderSettingsContext } from "./coderSettings";
import { useTheme } from "./theme";

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
