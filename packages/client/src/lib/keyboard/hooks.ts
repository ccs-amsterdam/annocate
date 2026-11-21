import { useContext, useEffect, useRef } from "react";
import { PRIORITY, type KeyHandler, type ScopeOptions } from "./controller";
import { KeyboardContext } from "./context";
import { arrowDirection, focusChosen, focusKeepsArrows, moveFocus } from "./focus";
import { keysOf, numbersMapping, targetForKey, type KeyMapping, type KeyTarget } from "./mappings";

/** The coder's keyboard mapping (numbers without a provider). */
export function useKeyMapping(): KeyMapping {
  return useContext(KeyboardContext)?.mapping ?? numbersMapping;
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
  /** Enter: e.g. continue with several answers. */
  onEnter?: () => void;
}

/**
 * A field's choices for the keyboard: groups of targets (a scale: a group
 * per item), chosen with `onChoose(group, index)`. Returns each target's key,
 * for its badge. Null: the field takes no keys (e.g. a dropdown).
 */
export function useKeyTargets(
  groups: readonly (readonly KeyTarget[])[] | null,
  onChoose: (group: number, index: number) => void,
  options: KeyTargetOptions = {},
): (string | null)[][] {
  const mapping = useKeyMapping();
  // After going back with the keyboard, the answer is focused, to change it at once
  const controller = useContext(KeyboardContext)?.controller;
  useEffect(() => {
    if (!controller?.takeFocusRequest()) return;
    const frame = requestAnimationFrame(() => focusChosen());
    return () => cancelAnimationFrame(frame);
  }, [controller]);
  useKeyScope(
    (press) => {
      if (!groups || press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) return false;
      if (press.key === "Enter" && options.onEnter) {
        options.onEnter();
        return true;
      }
      const g = options.activeGroup ?? 0;
      const group = groups[g];
      if (!group) return false;
      const index = targetForKey(mapping, group, press.key);
      if (index < 0) return false;
      onChoose(g, index);
      return true;
    },
    groups !== null,
    { priority: PRIORITY.field },
  );
  return (groups ?? []).map((group) => keysOf(mapping, group));
}

export interface BaseKeys {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

/**
 * The keys that work whatever the mapping (docs/client.md §5 "Keyboard"),
 * below the fields' own: arrows move focus between the answer targets
 * (Space or Enter then chooses the focused one), Shift + Left / Right go to
 * the previous / next question, Backspace goes back with the answer focused
 * (to change it at once; it isn't cleared), Enter continues when the
 * question was answered.
 */
export function useBaseKeys(nav: BaseKeys): void {
  const controller = useContext(KeyboardContext)?.controller;
  useKeyScope(
    (press) => {
      if (press.altKey || press.ctrlKey || press.metaKey) return false;
      if (press.shiftKey) {
        if (press.key === "ArrowLeft" && nav.canGoBack) nav.onBack();
        else if (press.key === "ArrowRight" && nav.canGoForward) nav.onForward();
        else return false;
        return true;
      }
      const direction = arrowDirection(press.key);
      if (direction) return !focusKeepsArrows() && moveFocus(direction);
      if (press.key === "Backspace" && nav.canGoBack) {
        controller?.requestFocus();
        nav.onBack();
        return true;
      }
      if (press.key === "Enter" && nav.canGoForward) {
        nav.onForward();
        return true;
      }
      return false;
    },
    true,
    { priority: PRIORITY.base },
  );
}
