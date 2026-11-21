import { useContext, useEffect, useRef } from "react";
import { PRIORITY, type KeyHandler, type ScopeOptions } from "./controller";
import { KeyboardContext } from "./context";
import { numbersMapping, targetForKey, type KeyMapping, type KeyTarget } from "./mappings";

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
  return (groups ?? []).map((group) => mapping.assign(group));
}
