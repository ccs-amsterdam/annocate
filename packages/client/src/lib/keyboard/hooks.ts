import { showKeyChoice } from "./keyChoice";
import { useContext, useEffect, useRef, useState } from "react";
import { PRIORITY, type KeyHandler, type KeyPress, type ScopeOptions } from "./controller";
import { KeyboardContext } from "./context";
import { useDisplay } from "../display/context";
import { arrowDirection, focusChosen, focusKeepsArrows, moveFocus } from "./focus";
import {
  effectiveMapping,
  keysOf,
  labelMatches,
  numbersMapping,
  targetForKey,
  type KeyMapping,
  type KeyTarget,
} from "./mappings";

/** The coder's keyboard mapping (numbers without a provider; the numpad only in responsive designs). */
export function useKeyMapping(): KeyMapping {
  const mapping = useContext(KeyboardContext)?.mapping ?? numbersMapping;
  const display = useDisplay();
  return mapping.id === "numpad" && display.layouts !== "responsive" ? numbersMapping : mapping;
}

/**
 * While `active`, a scope that gets key presses before the scopes below it
 * (see KeyController). The handler may change every render.
 */
export function useKeyScope(handler: KeyHandler, active = true, options: ScopeOptions = {}): void {
  const controller = useContext(KeyboardContext)?.controller;
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  const { priority, exclusive } = options;
  useEffect(() => {
    if (!controller || !active) return;
    return controller.add((press) => latest.current(press), { priority, exclusive });
  }, [controller, active, priority, exclusive]);
}

export interface KeyTargetOptions {
  /** The group keys choose in (a scale's item); default the first, -1: none. */
  activeGroup?: number;
  /** Shift + Enter: e.g. continue with several answers. */
  onEnter?: () => void;
  /** The field shows what was typed and dims what doesn't match: type-to-filter works (else numbers). */
  filterable?: boolean;
  /** The scope's priority (default a field's; a span's label menu is above the question's keys). */
  priority?: number;
}

export interface KeyTargets {
  /** Each target's key (its badge), per group. */
  keys: (string | null)[][];
  /** Type to filter: what was typed ("" when nothing, or another mapping). */
  filter: string;
  /** Type to filter: whether each target matches what was typed, per group. */
  matches: boolean[][];
}

/**
 * A field's choices for the keyboard: groups of targets (a scale: a group
 * per item), chosen with `onChoose(group, index)`. Returns each target's key
 * for its badge, and with type-to-filter what was typed and what matches.
 * Null: the field takes no keys (e.g. a dropdown). A mapping that can't map
 * a group (numpad beyond 3 x 3) leaves it to numbers.
 */
export function useKeyTargets(
  groups: readonly (readonly KeyTarget[])[] | null,
  onChoose: (group: number, index: number) => void,
  options: KeyTargetOptions = {},
): KeyTargets {
  const chosen = useKeyMapping();
  const mapping = chosen.kind === "filter" && !options.filterable ? numbersMapping : chosen;
  const [filter, setFilter] = useState("");
  // Letters from the labels: what was typed of a key of more than one letter (he, hi)
  const [typed, setTyped] = useState("");
  // After going back with the keyboard, the answer is focused, to change it at once
  const controller = useContext(KeyboardContext)?.controller;
  useEffect(() => {
    if (!controller?.takeFocusRequest()) return;
    const frame = requestAnimationFrame(() => focusChosen());
    return () => cancelAnimationFrame(frame);
  }, [controller]);
  const active = options.activeGroup ?? 0;
  // A choice by key shows what it chose (KeyChoiceFlash)
  const choose = (group: number, index: number, key: string) => {
    const label = groups?.[group]?.[index]?.label;
    if (label) showKeyChoice(key, label);
    onChoose(group, index);
  };
  const filtering = (group: readonly KeyTarget[] | undefined) =>
    !!group && effectiveMapping(mapping, group).kind === "filter";
  const matchesOf = (group: readonly KeyTarget[]) =>
    group.map((t) => t.fixed !== undefined || labelMatches(t.label, filter));
  const chooseByKey = (press: KeyPress): boolean => {
    if (!groups || press.onControl) return false;
    // Shift + Enter continues (as the Continue button); plain Enter is for the focused button
    if (press.key === "Enter" && press.shiftKey && options.onEnter) {
      options.onEnter();
      return true;
    }
    if (press.shiftKey) return false;
    const group = groups[active];
    if (!group) return false;
    const index = targetForKey(mapping, group, press.key);
    if (index < 0) return false;
    choose(active, index, press.key);
    return true;
  };
  useKeyScope(
    (press) => {
      if (!groups || press.altKey || press.ctrlKey || press.metaKey) return false;
      const group = groups[active];
      if (group && effectiveMapping(mapping, group).id === "letters") {
        const keys = keysOf(mapping, group);
        if (typed && (press.key === "Escape" || press.key === "Backspace")) {
          setTyped(press.key === "Backspace" ? typed.slice(0, -1) : "");
          return true;
        }
        if (press.key.length === 1 && !press.shiftKey) {
          const key = press.key.toLowerCase();
          // Go on with what was typed, else start again with this letter
          for (const next of typed ? [typed + key, key] : [key]) {
            const exact = keys.findIndex((k, i) => k === next && !group[i].disabled);
            if (exact >= 0) {
              setTyped("");
              choose(active, exact, next);
              return true;
            }
            if (keys.some((k) => k && k.length > next.length && k.startsWith(next))) {
              setTyped(next);
              return true;
            }
          }
          setTyped("");
        }
        return chooseByKey(press);
      }
      if (filtering(group) && group) {
        if (press.key === "Escape" && filter) setFilter("");
        else if (press.key === "Backspace" && filter) setFilter(filter.slice(0, -1));
        else if (press.key === "Enter" && filter) {
          const first = matchesOf(group).findIndex((m, i) => m && group[i].fixed === undefined && !group[i].disabled);
          if (first < 0) return true;
          setFilter("");
          choose(active, first, "Enter");
        } else if (
          press.key.length === 1 &&
          press.key !== " " &&
          press.key !== "?" &&
          (filter || targetForKey(mapping, group, press.key) < 0)
        )
          setFilter(filter + press.key);
        else return chooseByKey(press);
        return true;
      }
      return chooseByKey(press);
    },
    groups !== null,
    { priority: options.priority ?? PRIORITY.field },
  );
  const list = groups ?? [];
  return {
    keys: list.map((group) => keysOf(mapping, group)),
    filter: filtering(list[active]) ? filter : "",
    // While typing a key of letters: the options it can still be
    matches: list.map((group, i) =>
      i === active && filtering(group)
        ? matchesOf(group)
        : i === active && typed
          ? keysOf(mapping, group).map((k, j) => group[j].fixed !== undefined || !!k?.startsWith(typed))
          : group.map(() => true),
    ),
  };
}

/**
 * The keys (badges) `useKeyTargets` gives one group of targets, for a part
 * of the screen that shows them while another component takes the presses
 * (a span's labels at the selection). Without type-to-filter: numbers.
 */
export function useTargetKeys(group: readonly KeyTarget[]): (string | null)[] {
  const chosen = useKeyMapping();
  return keysOf(chosen.kind === "filter" ? numbersMapping : chosen, group);
}

export interface BaseKeys {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

/**
 * The keys that work whatever the mapping (docs/client.md §4 "Keyboard"),
 * below the fields' own: arrows move focus between the answer targets
 * (Space or Enter then chooses the focused one), Shift + Left / Right go to
 * the previous / next question (back with the answer focused), Shift + Enter
 * continues when the question was answered.
 */
export function useBaseKeys(nav: BaseKeys): void {
  const controller = useContext(KeyboardContext)?.controller;
  useKeyScope(
    (press) => {
      if (press.altKey || press.ctrlKey || press.metaKey || press.onControl) return false;
      if (press.shiftKey) {
        if (press.key === "ArrowLeft" && nav.canGoBack) {
          // With the answer focused, to change it at once (it isn't cleared)
          controller?.requestFocus();
          nav.onBack();
        } else if ((press.key === "ArrowRight" || press.key === "Enter") && nav.canGoForward) nav.onForward();
        else return false;
        return true;
      }
      const direction = arrowDirection(press.key);
      if (direction) return !focusKeepsArrows() && moveFocus(direction);
      return false;
    },
    true,
    { priority: PRIORITY.base },
  );
}
