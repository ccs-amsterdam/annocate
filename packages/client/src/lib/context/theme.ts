import { useEffect, useSyncExternalStore } from "react";

// Light or dark mode, shared by the coder UI and the researcher UI (one
// choice per browser, in localStorage). Without a saved choice it follows
// the system setting. The `dark` class on <html> switches the colours
// (index.css).

export type Theme = "light" | "dark";

const STORAGE_KEY = "annocate_theme";
const listeners = new Set<() => void>();
let current: Theme | null = null;

function initial(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage unavailable: follow the system.
  }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function get(): Theme {
  current ??= initial();
  return current;
}

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not saved: it still applies now.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The theme, and a setter; applies it to the page while the component is mounted. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, get, () => "light" as Theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return [theme, setTheme];
}
