import { useSyncExternalStore } from "react";

// Which help topic is open, if any: one help dialog for the whole researcher
// UI (`HelpDialog`, mounted by AdminApp), opened from anywhere with
// `openHelp` and a topic: its file name in ./topics, optionally with a
// heading (`snippets#names`) (docs/client.md §7).

export interface HelpTarget {
  slug: string;
  /** The id of a heading on the topic's page. */
  anchor?: string;
}

const listeners = new Set<() => void>();
let current: HelpTarget | null = null;

/** Parses `topic` or `topic#heading`. */
export function parseHelpTarget(target: string): HelpTarget {
  const [slug, anchor] = target.split("#");
  return anchor ? { slug, anchor } : { slug };
}

/** Opens the help dialog on a topic (default: the overview). */
export function openHelp(target = "overview"): void {
  current = parseHelpTarget(target);
  listeners.forEach((l) => l());
}

export function closeHelp(): void {
  current = null;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The open topic, or null when the dialog is closed. */
export function useHelpTarget(): HelpTarget | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
