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

/** The coder's settings (`CoderSettingsContextValue`), read from and saved to this browser. */
export function CoderSettingsProvider({ children }: { children: React.ReactNode }) {
  // The theme choice is shared with the researcher UI (theme.ts); a study can
  // show one theme for everyone (its display setting) instead of the coder's choice
  const [locked, lockTheme] = useState<"light" | "dark" | null>(null);
  const [chosen, setTheme] = useTheme(locked);
  const theme = locked ?? chosen;

  // The badges: shown by default on devices with a keyboard (not on touch-only devices)
  const [showShortcuts, setShowShortcutsState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = read("annocate_show_shortcuts");
    if (saved !== null) return saved !== "false";
    return !window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;
  });
  const [keyMapping, setKeyMappingState] = useState<string>(() => read("annotinder_key_mapping") ?? "numbers");
  // Answer shortcuts: off until the coder turns them on (stray keys don't answer)
  const [answerKeys, setAnswerKeysState] = useState<boolean>(() => read("annotinder_answer_keys") === "true");

  function setShowShortcuts(s: boolean) {
    setShowShortcutsState(s);
    write("annocate_show_shortcuts", String(s));
  }
  function setAnswerKeys(on: boolean) {
    setAnswerKeysState(on);
    write("annotinder_answer_keys", String(on));
  }
  function setKeyMapping(id: string) {
    setKeyMappingState(id);
    write("annotinder_key_mapping", id);
  }

  return (
    <CoderSettingsContext.Provider
      value={{
        theme,
        setTheme,
        themeLocked: locked !== null,
        lockTheme,
        showShortcuts,
        setShowShortcuts,
        answerKeys,
        setAnswerKeys,
        keyMapping,
        setKeyMapping,
      }}
    >
      {children}
    </CoderSettingsContext.Provider>
  );
}
