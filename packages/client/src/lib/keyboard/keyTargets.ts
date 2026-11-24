import type { KeyPress } from "./controller";
import { keysOf, labelMatches, targetForKey, type KeyMapping, type KeyTarget } from "./mappings";

// What a key press does to a group of targets (`useKeyTargets`), by the
// mapping's kind. Pure: the hook applies the result.

/** What a key press did: whether it was used, the target it chose, and what is typed now (left out: unchanged). */
export interface KeyResult {
  handled: boolean;
  choose?: { index: number; key: string };
  /** Letters: what is typed of a key of more than one letter. */
  typed?: string;
  /** Type to filter: what is typed. */
  filter?: string;
}

const NOT_HANDLED: KeyResult = { handled: false };

/** The target with this key, if any, is chosen. */
export function chooseByKey(press: KeyPress, mapping: KeyMapping, group: readonly KeyTarget[]): KeyResult {
  if (press.onControl || press.shiftKey) return NOT_HANDLED;
  const index = targetForKey(mapping, group, press.key);
  if (index < 0) return NOT_HANDLED;
  return { handled: true, choose: { index, key: press.key } };
}

/**
 * Letters from the labels: a key can be more than one letter (he, hi), so
 * letters are collected in `typed` until they are a target's key. Escape
 * and Backspace edit what was typed.
 */
export function handleLettersKey(
  press: KeyPress,
  mapping: KeyMapping,
  group: readonly KeyTarget[],
  typed: string,
): KeyResult {
  if (typed && (press.key === "Escape" || press.key === "Backspace")) {
    return { handled: true, typed: press.key === "Backspace" ? typed.slice(0, -1) : "" };
  }
  if (press.key.length !== 1 || press.shiftKey) return chooseByKey(press, mapping, group);
  const keys = keysOf(mapping, group);
  const key = press.key.toLowerCase();
  // Go on with what was typed, else start again with this letter
  for (const next of typed ? [typed + key, key] : [key]) {
    const exact = keys.findIndex((k, i) => k === next && !group[i].disabled);
    if (exact >= 0) return { handled: true, typed: "", choose: { index: exact, key: next } };
    if (keys.some((k) => k && k.length > next.length && k.startsWith(next))) return { handled: true, typed: next };
  }
  return { ...chooseByKey(press, mapping, group), typed: "" };
}

/**
 * Type to filter: characters are collected in `filter` (a character that is
 * a target's key chooses it, while nothing is typed); Enter chooses the
 * first target that matches; Escape and Backspace edit what was typed.
 */
export function handleFilterKey(
  press: KeyPress,
  mapping: KeyMapping,
  group: readonly KeyTarget[],
  filter: string,
): KeyResult {
  if (press.key === "Escape" && filter) return { handled: true, filter: "" };
  if (press.key === "Backspace" && filter) return { handled: true, filter: filter.slice(0, -1) };
  if (press.key === "Enter" && filter) {
    const first = group.findIndex((target) => labelMatches(target.label, filter) && !target.disabled);
    if (first < 0) return { handled: true };
    return { handled: true, filter: "", choose: { index: first, key: "Enter" } };
  }
  const character = press.key.length === 1 && press.key !== " ";
  if (character && (filter || targetForKey(mapping, group, press.key) < 0)) {
    return { handled: true, filter: filter + press.key };
  }
  return chooseByKey(press, mapping, group);
}
