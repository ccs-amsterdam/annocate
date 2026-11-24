import { useSyncExternalStore } from "react";
import type { TabId } from "../../../admin/tabs";
import { GUIDE_SECTIONS, sectionIndexOf } from "./guideSteps";

// The guide's state: one guide for the researcher UI (`GuideDialog`, mounted
// with a study's pages), opened from anywhere with `openGuide`. It opens on
// the section of a page, at the step last open there in this session (kept
// in memory only). "Show me" closes it and points at a real element (`ShowMe`).

interface GuidePosition {
  /** The section (`GUIDE_SECTIONS` index) and its step. */
  section: number;
  step: number;
}

export interface ShowMeTarget {
  /** The `data-guide` name of the element. */
  target: string;
  label: string;
}

let open: GuidePosition | null = null;
let showMe: ShowMeTarget | null = null;
/** Where the guide was when Show me closed it. */
let showMeFrom: GuidePosition | null = null;
/** The researcher made their first study: asked whether to take the guide (`GuidePrompt`). */
let prompt = false;
/** Per section, the step last open in it (this session). */
const lastStep = new Map<number, number>();

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Opens the guide on a page's section, at a step (by id), else where it was last in that section. */
export function openGuide(page: TabId, stepId?: string): void {
  const section = sectionIndexOf(page);
  const named = stepId ? GUIDE_SECTIONS[section].steps.findIndex((s) => s.id === stepId) : -1;
  goTo({ section, step: named >= 0 ? named : (lastStep.get(section) ?? 0) });
}

/** Shows a step (and remembers it as its section's). */
export function goTo(position: GuidePosition): void {
  open = position;
  showMe = null;
  lastStep.set(position.section, position.step);
  emit();
}

export function closeGuide(): void {
  open = null;
  emit();
}

/** Closes the guide and points at an element on the page. */
export function startShowMe(target: ShowMeTarget): void {
  showMe = target;
  showMeFrom = open;
  open = null;
  emit();
}

/** Stops pointing; `back`: to the guide, where it was. */
export function endShowMe(back = false): void {
  showMe = null;
  if (back && showMeFrom) open = showMeFrom;
  showMeFrom = null;
  emit();
}

/** Asks, once the study opens, whether to take the guide (after a researcher's first study). */
export function requestGuidePrompt(): void {
  prompt = true;
  emit();
}

/** The answer to the prompt: yes opens the guide at its start. */
export function answerGuidePrompt(yes: boolean): void {
  prompt = false;
  if (yes) goTo({ section: 0, step: 0 });
  else emit();
}

/** The open step (null: the guide is closed). */
export const guidePosition = (): GuidePosition | null => open;

export function useGuide(): GuidePosition | null {
  return useSyncExternalStore(subscribe, guidePosition, () => null);
}

export function useShowMe(): ShowMeTarget | null {
  return useSyncExternalStore(
    subscribe,
    () => showMe,
    () => null,
  );
}

export function useGuidePrompt(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => prompt,
    () => false,
  );
}
