// Keyboard mappings (docs/client.md §4 "Keyboard"): which key chooses which
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
  /** Where it is on screen, in a grid (row and column from 0), for mappings that follow the layout (numpad). */
  pos?: { row: number; col: number };
  disabled?: boolean;
}

export interface KeyMapping {
  id: MappingId;
  /** How the coder's settings call it. */
  name: string;
  /** For the settings: what it does, in a few words. */
  description: string;
  /** `filter`: typed letters filter the options by label (no keys of its own). */
  kind?: "keys" | "filter";
  /** Whether it can map this group (else the question uses numbers). Default: yes. */
  supports?(group: readonly KeyTarget[]): boolean;
  /** The key of each target of a group (null: none), shown on its badge and pressed to choose it. Gets the targets without a fixed key. */
  assign(group: readonly KeyTarget[]): (string | null)[];
}

export type MappingId = "numbers" | "numpad" | "letters" | "filter";

/** Number keys: 1 to 9 for the first nine options. */
export const numbersMapping: KeyMapping = {
  id: "numbers",
  name: "Numbers",
  description: "1 to 9, in the order of the options",
  assign: (group) => group.map((_, i) => (i < 9 ? String(i + 1) : null)),
};

/** The numpad's keys by row from the top, as on the numpad: 7 8 9, 4 5 6, 1 2 3. */
const NUMPAD = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];

/**
 * The numpad (responsive designs only, docs/client.md §4 "Display"): the
 * key where the button is, the first row always 7 8 9, then 4 5 6 and 1 2 3,
 * so a place has the same key in every question. Buttons in 3 columns (the
 * layouts make them so); beyond the first 9 none (the arrows reach them).
 * Targets without a place (a scale's points) use numbers.
 */
export const numpadMapping: KeyMapping = {
  id: "numpad",
  name: "Numpad",
  description: "The numpad's keys where the buttons are (7 8 9 at the top)",
  supports: (group) => group.length > 0 && group.every((t) => t.pos !== undefined && t.pos.col < 3),
  assign: (group) => group.map((t) => NUMPAD[t.pos!.row]?.[t.pos!.col] ?? null),
};

/** Letters in order of how easily touch typists reach them: the home row first. */
export const LETTERS = "asdfjklghqweruiopzxcvnmbty".split("");

/** Home-row letters: a s d f j k l g h, then the rows above and below; up to 26 options (else numbers). */
export const lettersMapping: KeyMapping = {
  id: "letters",
  name: "Letters",
  description: "Home-row letters (a s d f j k l …), for touch typists",
  supports: (group) => group.length <= LETTERS.length,
  assign: (group) => group.map((_, i) => LETTERS[i]),
};

/**
 * Type to filter: typed letters dim the options whose label doesn't match;
 * Enter chooses the first one left (KeyFilter). For questions with buttons;
 * others use numbers.
 */
export const filterMapping: KeyMapping = {
  id: "filter",
  name: "Type to filter",
  description: "Type part of a label, Enter chooses (for long lists)",
  kind: "filter",
  assign: (group) => group.map(() => null),
};

export const MAPPINGS: readonly KeyMapping[] = [numbersMapping, numpadMapping, lettersMapping, filterMapping];

/** A mapping by its id (numbers if unknown). */
export const mappingById = (id: string | null | undefined): KeyMapping =>
  MAPPINGS.find((m) => m.id === id) ?? numbersMapping;

/** The mapping a group uses: the chosen one, or numbers where it can't map it. */
export const effectiveMapping = (mapping: KeyMapping, group: readonly KeyTarget[]): KeyMapping =>
  mapping.supports && !mapping.supports(group.filter((t) => t.fixed === undefined)) ? numbersMapping : mapping;

/** Whether a label matches typed text: a word of it starts with the text (case and accents ignored). */
export function labelMatches(label: string, typed: string): boolean {
  if (!typed) return true;
  const fold = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const text = fold(typed);
  return (
    fold(label)
      .split(/[^\p{L}\p{N}]+/u)
      .some((word) => word.startsWith(text)) || fold(label).startsWith(text)
  );
}

/** The key of each target of a group: its fixed key, else the mapping's (which assigns the others in order). */
export function keysOf(mapping: KeyMapping, group: readonly KeyTarget[]): (string | null)[] {
  const free = group.filter((t) => t.fixed === undefined);
  const assigned = effectiveMapping(mapping, group).assign(free);
  let i = 0;
  return group.map((t) => t.fixed ?? assigned[i++] ?? null);
}

/** The target of a group a key chooses (its key, or one of its extra keys), or -1. */
export function targetForKey(mapping: KeyMapping, group: readonly KeyTarget[], key: string): number {
  const keys = keysOf(mapping, group);
  return group.findIndex((t, i) => !t.disabled && (keys[i] === key || t.keys?.includes(key)));
}
