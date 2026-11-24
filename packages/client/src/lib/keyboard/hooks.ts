import { showKeyChoice } from "./keyChoice";
import type { SpecialKind } from "@annotinder/contracts";
import { isBack, isContinue, isForward, specialBadge, specialOfPress } from "./commands";
import { useContext, useEffect, useRef, useState } from "react";
import { PRIORITY, type KeyHandler, type ScopeOptions } from "./controller";
import { AnswerKeysContext, KeyboardContext } from "./context";
import { useDisplay } from "../display/context";
import { arrowDirection, focusChosen, focusKeepsArrows, moveFocus } from "./focus";
import { chooseByKey, handleFilterKey, handleLettersKey, type KeyResult } from "./keyTargets";
import {
  effectiveMapping,
  keysOf,
  labelMatches,
  noKeysMapping,
  numbersMapping,
  type KeyMapping,
  type KeyTarget,
} from "./mappings";

/** The coder's keyboard mapping (numbers without a provider; the numpad only in responsive designs). */
export function useKeyMapping(): KeyMapping {
  const answerKeys = useContext(AnswerKeysContext);
  const chosen = useContext(KeyboardContext)?.mapping ?? numbersMapping;
  const mapping = answerKeys ? chosen : noKeysMapping;
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

/** While `open` (a menu, popover or dialog of the coding screen), keys never reach the question behind it. */
export function useMenuKeys(open: boolean): void {
  useKeyScope(() => false, open, { priority: PRIORITY.menu, exclusive: true });
}

/**
 * After going back with the keyboard, the answer is focused, to change it at
 * once (`useBaseKeys` asks for it). Called by the question when it comes on
 * screen, whatever its answer field: the request never waits for a later
 * question. A field without answer targets (a text box) has nothing to focus.
 */
export function useFocusAfterBack(): void {
  const controller = useContext(KeyboardContext)?.controller;
  useEffect(() => {
    if (!controller) return;
    // Taken once the question is painted (and not by an effect React runs twice in development)
    const frame = requestAnimationFrame(() => {
      if (controller.takeFocusRequest()) focusChosen();
    });
    return () => cancelAnimationFrame(frame);
  }, [controller]);
}

export interface KeyTargetOptions {
  /** The group keys choose in (a scale's item); default the first, -1: none. */
  activeGroup?: number;
  /** Ctrl + Enter: e.g. continue with several answers. */
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
  const active = options.activeGroup ?? 0;
  // A choice by key shows what it chose (KeyChoiceFlash)
  const choose = (group: number, index: number, key: string) => {
    const label = groups?.[group]?.[index]?.label;
    if (label) showKeyChoice(key, label);
    onChoose(group, index);
  };
  const filtering = (group: readonly KeyTarget[] | undefined) =>
    !!group && effectiveMapping(mapping, group).kind === "filter";
  const matchesOf = (group: readonly KeyTarget[]) => group.map((t) => labelMatches(t.label, filter));
  const apply = (result: KeyResult): boolean => {
    if (result.typed !== undefined) setTyped(result.typed);
    if (result.filter !== undefined) setFilter(result.filter);
    if (result.choose) choose(active, result.choose.index, result.choose.key);
    return result.handled;
  };
  useKeyScope(
    (press) => {
      // Ctrl + Enter continues (as the Continue button); plain Enter is for the focused button
      if (groups && isContinue(press) && options.onEnter) {
        options.onEnter();
        return true;
      }
      if (!groups || press.altKey || press.ctrlKey || press.metaKey) return false;
      const group = groups[active];
      if (!group) return false;
      const used = effectiveMapping(mapping, group);
      if (used.id === "letters") return apply(handleLettersKey(press, mapping, group, typed));
      if (used.kind === "filter") return apply(handleFilterKey(press, mapping, group, filter));
      return apply(chooseByKey(press, mapping, group));
    },
    groups !== null,
    { priority: options.priority ?? PRIORITY.field },
  );
  /** Whether each target of a group can still be meant by what was typed (all, in a group the keys don't work in). */
  const matchesIn = (group: readonly KeyTarget[], index: number): boolean[] => {
    if (index === active && filtering(group)) return matchesOf(group);
    // While typing a key of letters: the options it can still be
    if (index === active && typed) return keysOf(mapping, group).map((k) => !!k?.startsWith(typed));
    return group.map(() => true);
  };
  const list = groups ?? [];
  return {
    keys: list.map((group) => keysOf(mapping, group)),
    filter: filtering(list[active]) ? filter : "",
    matches: list.map(matchesIn),
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

/**
 * A question's special answers for the keyboard (docs/client.md §4): / 8
 * don't know, / 9 not applicable (or Ctrl + 8 / 9 where the browser lets
 * them through). A command: it works whatever the answer keys setting, while
 * `active` (a scale: the item keys answer). Returns their badges.
 */
export function useSpecialKeys(
  specials: readonly { kind: SpecialKind; label: string }[],
  onChoose: (kind: SpecialKind) => void,
  active = true,
): (string | null)[] {
  useKeyScope(
    (press) => {
      const kind = specialOfPress(press);
      const special = kind && specials.find((s) => s.kind === kind);
      if (!special) return false;
      showKeyChoice(specialBadge(special.kind), special.label);
      onChoose(special.kind);
      return true;
    },
    active && specials.length > 0,
    { priority: PRIORITY.field },
  );
  return specials.map((s) => (active ? specialBadge(s.kind) : null));
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
 * (Space or Enter then chooses the focused one), Ctrl + Left / Right go to
 * the previous / next question (back with the answer focused), Ctrl + Enter
 * continues when the question was answered (keyboard/commands.ts).
 */
export function useBaseKeys(nav: BaseKeys): void {
  const controller = useContext(KeyboardContext)?.controller;
  useKeyScope(
    (press) => {
      if (isBack(press)) {
        if (!nav.canGoBack) return false;
        // With the answer focused, to change it at once (it isn't cleared)
        controller?.requestFocus();
        nav.onBack();
        return true;
      }
      if (isForward(press) || isContinue(press)) {
        if (!nav.canGoForward) return false;
        nav.onForward();
        return true;
      }
      if (press.altKey || press.ctrlKey || press.metaKey || press.shiftKey || press.onControl) return false;
      const direction = arrowDirection(press.key);
      if (direction) return !focusKeepsArrows() && moveFocus(direction);
      return false;
    },
    true,
    { priority: PRIORITY.base },
  );
}
