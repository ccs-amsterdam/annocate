import { useEffect, useMemo, useRef, useState } from "react";
import type { DisplayEntry } from "@annotinder/contracts";
import type { CoderApi } from "../../api/httpCoderApi";
import { useCoderSettings } from "../../context/coderSettings";
import type { DisplayState } from "../../display/context";
import { loginAvailable } from "../../session/coderSession";
import { useDisplayLog, useWidthClass, type WidthClass } from "../../display/hooks";
import type { StudyManagerNavigation, StudyManagerSnapshot } from "../../studyManager/types";

/** Whether this server offers a login; null until known. */
export function useLoginAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void loginAvailable().then(setAvailable);
  }, []);
  return available;
}

export type NavDirection = "next" | "previous";

/** A number that grows as the coder moves forward (step, unit, question), to tell forward from back. */
export function positionOf(nav: StudyManagerNavigation): number {
  const phaseIdx = nav.currentPhaseIndex;
  const phase = nav.phases[phaseIdx];
  if (!phase) return 0;
  if (phase.type === "unit_loop") {
    const unitIdx = nav.currentUnitIndex ?? 0;
    const qIdx = phase.questions?.findIndex((q) => q.isCurrent) ?? 0;
    return phaseIdx * 1_000_000 + unitIdx * 100 + (qIdx >= 0 ? qIdx : 0);
  }
  return phaseIdx * 1_000_000;
}

/**
 * Which way the coder last moved, for the slide animations. Set at once by
 * the screen's own buttons and keys; any other move (a jump in the menu) is
 * told from the change in position.
 */
export function useNavDirection(navigation: StudyManagerNavigation): [NavDirection, (d: NavDirection) => void] {
  const [direction, setDirection] = useState<NavDirection>("next");
  const position = useMemo(() => positionOf(navigation), [navigation]);
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (previous.current !== null && position !== previous.current) {
      setDirection(position < previous.current ? "previous" : "next");
    }
    previous.current = position;
  }, [position]);
  return [direction, setDirection];
}

/** Where the coder is ("2"; "4.1": the 1st question of the loop that is the 4th step), for a question's animation key. */
export function positionLabel(snapshot: StudyManagerSnapshot): string | null {
  if (!snapshot.currentItem) return null;
  const { currentPhaseIndex, phases } = snapshot.navigation;
  const phase = phases[currentPhaseIndex];
  if (!phase) return null;
  const step = currentPhaseIndex + 1;
  if (phase.type !== "unit_loop") return `${step}`;
  const question = phase.questions?.findIndex((q) => q.isCurrent) ?? -1;
  return `${step}.${question >= 0 ? question + 1 : 1}`;
}

/** While answers are still being saved, leaving the page asks first. */
export function useLeaveWarning(unsaved: boolean): void {
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
}

/** The study's public title names the browser tab. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}

/** Whether to flash "Correct" now: briefly, each time another practice question was answered right. */
export function usePracticeFlash(practiceRight: number): boolean {
  const [seen, setSeen] = useState(0);
  const flash = practiceRight > seen;
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setSeen(practiceRight), 900);
    return () => window.clearTimeout(timer);
  }, [flash, practiceRight]);
  return flash;
}

/**
 * How the coding screen looks (docs/client.md §4 "Display"): the study's
 * layouts and theme, and the width of the coding area (measured on the
 * element the returned ref is put on). A study's fixed theme overrides the
 * coder's choice. Once the session is loaded, the display is recorded with
 * it: the keys (the numpad only where it works), the width where layouts
 * follow it, and the theme where the coder chooses it.
 */
export function useCodingDisplay(
  snapshot: StudyManagerSnapshot,
  coderApi: CoderApi,
): [DisplayState, (el: HTMLElement | null) => void] {
  const [width, screen] = useWidthClass();
  const display: DisplayState = {
    layouts: snapshot.display.layouts ?? "fixed",
    theme: snapshot.display.theme ?? "coder",
    // Narrow until measured (before the first paint)
    width: width ?? "narrow",
  };
  const { lockTheme, keyMapping, theme: shownTheme } = useCoderSettings();
  useEffect(() => {
    lockTheme(display.theme === "coder" ? null : display.theme);
    return () => lockTheme(null);
  }, [display.theme, lockTheme]);
  const loaded = snapshot.phase !== "loading" && snapshot.phase !== "error";
  useDisplayLog(
    coderApi.postDisplay ? (entry) => coderApi.postDisplay!(entry) : undefined,
    loaded ? displayEntry(display, width, keyMapping, shownTheme) : null,
  );
  return [display, screen];
}

/**
 * The display to record: the keys (the numpad only where it works), the
 * width where layouts follow it, and the theme where the coder chooses it.
 * Null while a width to record isn't measured yet (so a wide screen is never
 * recorded as narrow first).
 */
export function displayEntry(
  display: Pick<DisplayState, "layouts" | "theme">,
  width: WidthClass | null,
  keyMapping: string,
  shownTheme: "light" | "dark",
): DisplayEntry | null {
  const responsive = display.layouts === "responsive";
  if (responsive && width === null) return null;
  return {
    keys: keyMapping === "numpad" && !responsive ? "numbers" : keyMapping,
    ...(responsive && width ? { width } : {}),
    ...(display.theme === "coder" ? { theme: shownTheme } : {}),
  };
}
