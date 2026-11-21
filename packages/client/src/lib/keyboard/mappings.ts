// Keyboard mappings (docs/client.md §5 "Keyboard"): which key chooses which
// of a question's options. A mapping only gives keys; the controller and the
// fields decide what choosing does. Pure functions: tested without a browser.

/** One of the choices a field offers the keyboard: an option button, a scale point. */
export interface KeyTarget {
  /** Its label (for mappings that type labels). */
  label: string;
  /** Keys that also choose it, whatever the mapping (e.g. a swipe's arrow; no badge). */
  keys?: string[];
  /** Its own key instead of the mapping's, shown on its badge (special options: 0 and .). */
  fixed?: string;
  disabled?: boolean;
}

export interface KeyMapping {
  id: string;
  /** How the coder's settings call it. */
  name: string;
  /** The key of each target of a group (null: none), shown on its badge and pressed to choose it. Gets the targets without a fixed key. */
  assign(group: readonly KeyTarget[]): (string | null)[];
}

/** Number keys: 1 to 9 for the first nine options. */
export const numbersMapping: KeyMapping = {
  id: "numbers",
  name: "Numbers",
  assign: (group) => group.map((_, i) => (i < 9 ? String(i + 1) : null)),
};

/** The key of each target of a group: its fixed key, else the mapping's (which assigns the others in order). */
export function keysOf(mapping: KeyMapping, group: readonly KeyTarget[]): (string | null)[] {
  const free = group.filter((t) => t.fixed === undefined);
  const assigned = mapping.assign(free);
  let i = 0;
  return group.map((t) => t.fixed ?? assigned[i++] ?? null);
}

/** The target of a group a key chooses (its key, or one of its extra keys), or -1. */
export function targetForKey(mapping: KeyMapping, group: readonly KeyTarget[], key: string): number {
  const keys = keysOf(mapping, group);
  return group.findIndex((t, i) => !t.disabled && (keys[i] === key || t.keys?.includes(key)));
}
