import { useCallback, useEffect, useRef, useState } from "react";
import { resolveLayout, type AnyVariableType, type DisplayEntry, type ResolvedLayout } from "@annotinder/contracts";
import { useKeyMapping } from "../keyboard/hooks";
import { useDisplay, type DisplayState } from "./context";

/** Wider than a phone: the question column has more room. */
const WIDE_PX = 600;

export type WidthClass = DisplayState["width"];

/** The width class of a width in px. */
export const widthClass = (px: number): WidthClass => (px >= WIDE_PX ? "wide" : "narrow");

/**
 * The width class of the coding area (an element: a phone-sized preview on
 * a desktop is narrow), following resizes; null until the element is there
 * and measured (it may appear later, after loading). Returns it and a ref
 * callback for the element.
 */
export function useWidthClass(): [WidthClass | null, (el: HTMLElement | null) => void] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<WidthClass | null>(null);
  // Measured as the element appears: before paint, and before anything is recorded (useDisplayLog)
  const measured = useCallback((element: HTMLElement | null) => {
    setEl(element);
    if (element) setWidth(widthClass(element.getBoundingClientRect().width));
  }, []);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(widthClass(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [width, measured];
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

/** A change of width alone waits this long: a newer one in the meantime replaces it (resizing a window). */
const WIDTH_DELAY_MS = 3000;

/**
 * Sends how the coder's screen looks (docs/client.md §4 "Display") when it
 * starts and when it changes; the server records it with a timestamp. A
 * change of the width class alone waits 3 seconds, so resizing records only
 * where it ends up. Null: not yet (the session isn't loaded).
 */
export function useDisplayLog(send: ((entry: DisplayEntry) => Promise<void>) | undefined, entry: DisplayEntry | null) {
  const sent = useRef<DisplayEntry | null>(null);
  const key = entry ? JSON.stringify(entry) : null;
  useEffect(() => {
    if (!send || !entry || key === JSON.stringify(sent.current)) return;
    const previous = sent.current;
    const go = () => {
      sent.current = entry;
      void send(entry).catch(() => {
        // Not recorded (offline): tried again with the next change
        sent.current = previous;
      });
    };
    const widthOnly = previous !== null && previous.keys === entry.keys && previous.theme === entry.theme;
    if (!widthOnly) return go();
    const timer = window.setTimeout(go, WIDTH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // The entry by its content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, send]);
}
