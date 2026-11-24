import React, { useEffect, useState } from "react";
import { UserSettingsSchema, type UserSettings } from "@annotinder/contracts";
import { CLIENT_HEADERS } from "../api/httpCoderApi";
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

/**
 * The coder's settings (`CoderSettingsContextValue`), read from and saved to
 * this browser; with a login also to their account (`accountUrl`: the API,
 * `GET` / `PUT /coder/settings`), so they follow the coder to every device.
 */
export function CoderSettingsProvider({ children, accountUrl }: { children: React.ReactNode; accountUrl?: string }) {
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

  // Logged in: the account's settings, and later changes saved there too (no login: 401, the browser's only)
  const [account, setAccount] = useState(false);
  useEffect(() => {
    if (!accountUrl) return;
    let live = true;
    fetch(`${accountUrl}/coder/settings`, { headers: CLIENT_HEADERS, credentials: "same-origin" })
      .then(async (res) => {
        const parsed = res.ok ? UserSettingsSchema.safeParse(await res.json()) : null;
        if (!live || !parsed?.success) return;
        const saved = parsed.data;
        if (saved.theme) setTheme(saved.theme);
        if (saved.answerKeys !== undefined) setAnswerKeysState(saved.answerKeys);
        if (saved.keyMapping) setKeyMappingState(saved.keyMapping);
        if (saved.showShortcuts !== undefined) setShowShortcutsState(saved.showShortcuts);
        setAccount(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Once per coding screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUrl]);
  const save = (patch: Partial<UserSettings>) => {
    if (!account || !accountUrl) return;
    void fetch(`${accountUrl}/coder/settings`, {
      method: "PUT",
      headers: { ...CLIENT_HEADERS, "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        theme: chosen,
        answerKeys,
        keyMapping: keyMapping as UserSettings["keyMapping"],
        showShortcuts,
        ...patch,
      }),
    }).catch(() => {});
  };

  function setShowShortcuts(s: boolean) {
    setShowShortcutsState(s);
    write("annocate_show_shortcuts", String(s));
    save({ showShortcuts: s });
  }
  function setAnswerKeys(on: boolean) {
    setAnswerKeysState(on);
    write("annotinder_answer_keys", String(on));
    save({ answerKeys: on });
  }
  function setKeyMapping(id: string) {
    setKeyMappingState(id);
    write("annotinder_key_mapping", id);
    save({ keyMapping: id as UserSettings["keyMapping"] });
  }
  function setThemeAndSave(next: "light" | "dark") {
    setTheme(next);
    save({ theme: next });
  }

  return (
    <CoderSettingsContext.Provider
      value={{
        theme,
        setTheme: setThemeAndSave,
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
