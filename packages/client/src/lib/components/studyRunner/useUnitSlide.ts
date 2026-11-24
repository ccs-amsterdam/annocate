import { useState } from "react";
import type { NavDirection } from "./hooks";

/** A unit on screen and the slide it came in with (`""`: none, or over). */
export interface UnitSlide {
  unitId: number | string;
  slideClass: string;
}

/** The slide for the unit on screen: kept for the same unit; a new unit comes in from the side the coder moved to. */
export function unitSlide(shown: UnitSlide, unitId: number | string, direction: NavDirection): UnitSlide {
  if (shown.unitId === unitId) return shown;
  return { unitId, slideClass: direction === "next" ? "animate-slide-in-right" : "animate-slide-in-left" };
}

/**
 * A new unit slides in from the side the coder moved to. Returns the props
 * of the unit's content: a key per unit (decided while rendering, so the
 * content mounts once per unit) and the slide's class until it has run.
 */
export function useUnitSlide(
  unitId: number | string,
  direction: NavDirection,
): { key: string; slideClass: string; onAnimationEnd: () => void } {
  const [shown, setShown] = useState<UnitSlide>({ unitId, slideClass: "" });
  const current = unitSlide(shown, unitId, direction);
  if (current !== shown) setShown(current);
  return {
    key: `unit-${current.unitId}`,
    slideClass: current.slideClass,
    onAnimationEnd: () => setShown((s) => (s.slideClass ? { ...s, slideClass: "" } : s)),
  };
}
