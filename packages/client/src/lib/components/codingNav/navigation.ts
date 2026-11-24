import type { NavigationPhase, StudyManagerNavigation } from "../../studyManager/types";

// What the coding screen's navigation shows of `StudyManagerNavigation`.

/** The steps listed in the menu: questions and unit loops the coder got to. */
export function listedSteps(navigation: StudyManagerNavigation): NavigationPhase[] {
  return navigation.phases.filter(
    (p) => (p.type === "question" || p.type === "unit_loop") && p.index <= navigation.maxReachedTopIndex,
  );
}

/** The study is one unit loop only: there is nothing to list in the menu. */
export function isOnlyLoop(navigation: StudyManagerNavigation): boolean {
  const loops = navigation.phases.filter((p) => p.type === "unit_loop").length;
  return loops === 1 && navigation.phases.every((p) => p.type !== "question");
}

/** A question step's number among the study's top-level questions (1, 2, ...). */
function questionNumber(phases: NavigationPhase[], phase: NavigationPhase): number {
  return phases.filter((p) => p.type === "question" && p.index <= phase.index).length;
}

/**
 * A loop's units: the coder's unit (the current one, else the furthest
 * they got), the furthest they reached, and how many they get, if known
 * (not in a shared queue without a maximum).
 */
export function loopUnits(
  phase: NavigationPhase,
  navigation: StudyManagerNavigation,
): { current: number; reached: number; total: number | null } {
  const reached = Math.max(1, phase.unitCount ?? 0);
  const current = phase.isCurrent ? (phase.currentUnitIndex ?? navigation.currentUnitIndex ?? 0) + 1 : reached;
  return { current, reached, total: phase.totalUnits ? Math.max(reached, phase.totalUnits) : null };
}

/** Where the coder is, short (`text`) and in words (`title`). */
export interface Position {
  text: string;
  title: string;
}

/**
 * Where the coder is: "3" (the 3rd question), or in a loop "4 · 2" (unit 4,
 * 2nd question; just "4" if the loop has one question). Null at any other
 * step.
 */
export function positionOf(navigation: StudyManagerNavigation): Position | null {
  const current = navigation.phases[navigation.currentPhaseIndex];
  if (current?.type === "question") {
    const n = questionNumber(navigation.phases, current);
    return { text: String(n), title: `Question ${n}` };
  }
  if (current?.type !== "unit_loop") return null;
  const { current: unit } = loopUnits(current, navigation);
  const q = (current.questions ?? []).findIndex((x) => x.isCurrent);
  // The loop's questions, not those reached so far: "4 · 1" from the unit's first question
  const several = (current.questionCount ?? 0) > 1 && q >= 0;
  if (!several) return { text: String(unit), title: `Unit ${unit}` };
  return { text: `${unit} · ${q + 1}`, title: `Unit ${unit}, question ${q + 1}` };
}
