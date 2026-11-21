import React, { useState } from "react";
import { CoderSettingsContext } from "./coderSettings";
import { useTheme } from "./theme";

/** The browser's storage can be unavailable (private windows, blocked site data): settings then last the visit. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // kept for this visit only
  }
}

export function CoderSettingsProvider({ children }: { children: React.ReactNode }) {
  // Shared with the researcher UI (theme.ts).
  const [theme, setTheme] = useTheme();

  // The badges: shown by default on devices with a keyboard (not on touch-only devices)
  const [showShortcuts, setShowShortcutsState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = read("annocate_show_shortcuts");
    if (saved !== null) return saved !== "false";
    return !window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;
  });
  const [keyMapping, setKeyMappingState] = useState<string>(() => read("annotinder_key_mapping") ?? "numbers");

  function setShowShortcuts(s: boolean) {
    setShowShortcutsState(s);
    write("annocate_show_shortcuts", String(s));
  }
  function setKeyMapping(id: string) {
    setKeyMappingState(id);
    write("annotinder_key_mapping", id);
  }

  return (
    <CoderSettingsContext.Provider
      value={{ theme, setTheme, showShortcuts, setShowShortcuts, keyMapping, setKeyMapping }}
    >
      {children}
    </CoderSettingsContext.Provider>
  );
}
