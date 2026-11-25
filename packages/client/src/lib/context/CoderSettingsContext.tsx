import React, { useEffect, useState } from "react";
import { UserSettingsSchema, type UserSettings } from "@annotinder/contracts";
import { CLIENT_HEADERS } from "../api/httpCoderApi";
import { CoderSettingsContext } from "./coderSettings";
import { useTheme } from "./theme";

/** Where each setting is kept in this browser (as all the app's keys: `annotinder:<name>`). */
const STORAGE_KEYS = {
  showShortcuts: "annotinder:show-shortcuts",
  keyMapping: "annotinder:key-mapping",
  answerKeys: "annotinder:answer-keys",
} as const;

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
 * A setting kept in this browser. Returns its value, `set` (for this visit:
 * a value that comes from the account) and `store` (set, and saved in the
 * browser).
 */
function usePersistedSetting<T extends string | boolean>(
  key: string,
  initial: (saved: string | null) => T,
): { value: T; set: (value: T) => void; store: (value: T) => void } {
  const [value, set] = useState<T>(() => initial(read(key)));
  const store = (next: T) => {
    set(next);
    write(key, String(next));
  };
  return { value, set, store };
}

/** The badges: shown by default on devices with a keyboard (not on touch-only devices). */
function initialShowShortcuts(saved: string | null): boolean {
  if (typeof window === "undefined") return true;
  if (saved !== null) return saved !== "false";
  return !window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;
}

/**
 * The settings of a logged-in coder's account (`accountUrl`: the API, `GET`
 * / `PUT /coder/settings`): `onLoaded` gets them once, and `save` saves
 * later changes there too (no login: 401, the browser's only). `loggedIn`:
 * whether the server knew a login (null until it answered).
 */
function useAccountSettings(
  accountUrl: string | undefined,
  onLoaded: (saved: UserSettings) => void,
): { loggedIn: boolean | null; save: (settings: UserSettings) => void } {
  const [account, setAccount] = useState<boolean | null>(null);
  useEffect(() => {
    if (!accountUrl) return;
    let live = true;
    fetch(`${accountUrl}/coder/settings`, { headers: CLIENT_HEADERS, credentials: "same-origin" })
      .then(async (res) => {
        const parsed = res.ok ? UserSettingsSchema.safeParse(await res.json()) : null;
        if (!live) return;
        if (res.status === 401) setAccount(false);
        if (!parsed?.success) return;
        onLoaded(parsed.data);
        setAccount(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Once per coding screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUrl]);
  const save = (settings: UserSettings) => {
    if (!account || !accountUrl) return;
    void fetch(`${accountUrl}/coder/settings`, {
      method: "PUT",
      headers: { ...CLIENT_HEADERS, "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(settings),
    }).catch(() => {});
  };
  return { loggedIn: account, save };
}

/**
 * The coder's settings (`CoderSettingsContextValue`), read from and saved to
 * this browser; with a login also to their account (`accountUrl`), so they
 * follow the coder to every device.
 */
export function CoderSettingsProvider({ children, accountUrl }: { children: React.ReactNode; accountUrl?: string }) {
  // The theme choice is shared with the researcher UI (theme.ts); a study can
  // show one theme for everyone (its display setting) instead of the coder's choice
  const [locked, lockTheme] = useState<"light" | "dark" | null>(null);
  const [chosen, setTheme] = useTheme(locked);
  const theme = locked ?? chosen;

  const showShortcuts = usePersistedSetting(STORAGE_KEYS.showShortcuts, initialShowShortcuts);
  const keyMapping = usePersistedSetting<string>(STORAGE_KEYS.keyMapping, (saved) => saved ?? "numbers");
  // Answer shortcuts: off until the coder turns them on (stray keys don't answer)
  const answerKeys = usePersistedSetting(STORAGE_KEYS.answerKeys, (saved) => saved === "true");

  const { loggedIn, save: saveToAccount } = useAccountSettings(accountUrl, (saved) => {
    if (saved.theme) setTheme(saved.theme);
    if (saved.answerKeys !== undefined) answerKeys.set(saved.answerKeys);
    if (saved.keyMapping) keyMapping.set(saved.keyMapping);
    if (saved.showShortcuts !== undefined) showShortcuts.set(saved.showShortcuts);
  });
  const save = (patch: Partial<UserSettings>) =>
    saveToAccount({
      theme: chosen,
      answerKeys: answerKeys.value,
      keyMapping: keyMapping.value as UserSettings["keyMapping"],
      showShortcuts: showShortcuts.value,
      ...patch,
    });

  return (
    <CoderSettingsContext.Provider
      value={{
        theme,
        setTheme: (next) => {
          setTheme(next);
          save({ theme: next });
        },
        themeLocked: locked !== null,
        lockTheme,
        showShortcuts: showShortcuts.value,
        setShowShortcuts: (show) => {
          showShortcuts.store(show);
          save({ showShortcuts: show });
        },
        answerKeys: answerKeys.value,
        setAnswerKeys: (on) => {
          answerKeys.store(on);
          save({ answerKeys: on });
        },
        keyMapping: keyMapping.value,
        setKeyMapping: (id) => {
          keyMapping.store(id);
          save({ keyMapping: id as UserSettings["keyMapping"] });
        },
        loggedIn,
      }}
    >
      {children}
    </CoderSettingsContext.Provider>
  );
}
