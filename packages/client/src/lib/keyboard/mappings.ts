// Keyboard mappings (docs/client.md §5 "Keyboard"): which key chooses which
// of a question's options. A mapping only gives keys; the controller and the
// fields decide what choosing does. Pure functions: tested without a browser.

/** One of the choices a field offers the keyboard: an option button, a scale point. */
export interface KeyTarget {
  /** Its label (for mappings that type labels). */
  label: string;
  /** Keys that always choose it, whatever the mapping (e.g. a swipe's arrow). */
  keys?: string[];
  disabled?: boolean;
}

export interface KeyMapping {
  id: string;
  /** How the coder's settings call it. */
  name: string;
  /** The key of each target of a group (null: none), shown on its badge and pressed to choose it. */
  assign(group: readonly KeyTarget[]): (string | null)[];
}

/** Number keys: 1 to 9 for the first nine options. */
export const numbersMapping: KeyMapping = {
  id: "numbers",
  name: "Numbers",
  assign: (group) => group.map((_, i) => (i < 9 ? String(i + 1) : null)),
};

/** The target of a group a key chooses (its mapped key or one of its fixed keys), or -1. */
export function targetForKey(mapping: KeyMapping, group: readonly KeyTarget[], key: string): number {
  const assigned = mapping.assign(group);
  const index = group.findIndex((t, i) => !t.disabled && (assigned[i] === key || t.keys?.includes(key)));
  return index;
}
