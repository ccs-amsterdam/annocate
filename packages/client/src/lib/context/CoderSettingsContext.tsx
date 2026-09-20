import React, { createContext, useContext, useState, useEffect } from "react";

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
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("annocate_theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [showShortcuts, setShowShortcutsState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("annocate_show_shortcuts");
    return saved !== "false";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("annocate_theme", theme);
  }, [theme]);

  function setTheme(t: "light" | "dark") {
    setThemeState(t);
  }

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
