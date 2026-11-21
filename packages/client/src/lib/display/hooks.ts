import { useEffect, useState, type RefObject } from "react";
import { resolveLayout, type AnyVariableType, type ResolvedLayout } from "@annotinder/contracts";
import { useKeyMapping } from "../keyboard/hooks";
import { useDisplay } from "./context";

/** Wider than a phone: the question column has more room. */
const WIDE_PX = 600;

/**
 * The width class of the coding area (an element: a phone-sized preview on
 * a desktop is narrow), following resizes.
 */
export function useWidthClass(ref: RefObject<HTMLElement | null>): "narrow" | "wide" {
  const [width, setWidth] = useState<"narrow" | "wide">("narrow");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width >= WIDE_PX ? "wide" : "narrow"));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * A question's layout (contracts `resolveLayout`): in a responsive design
 * its "auto" layout also follows the screen and the coder's keys.
 */
export function useAnswerLayout(variable: AnyVariableType): ResolvedLayout {
  const display = useDisplay();
  const mapping = useKeyMapping();
  return display.layouts === "responsive"
    ? resolveLayout(variable, { width: display.width, keys: mapping.id })
    : resolveLayout(variable);
}
