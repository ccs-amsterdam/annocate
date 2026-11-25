import { itemName, type CoderUnitLoopItem, type DesignItem } from "@annotinder/contracts";
import { loopQuestionNames } from "./items";
import { stepLabel } from "./navigationLabels";
import type { OpenUnit } from "./Position";
import type { LoopHistory } from "./UnitHistory";
import type { NavigationPhase, NavigationUnitQuestion, StudyManagerNavigation } from "./types";

/** A unit loop as the navigation shows it. */
export interface LoopNavigation {
  key: string;
  history: LoopHistory;
  /** Units this coder will get in the loop, if known. */
  totalUnits?: number;
}

/** Where the coder is, as far as the navigation menu shows it. */
export interface NavigationInput {
  topSteps: DesignItem[];
  topIndex: number;
  maxReachedTopIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;
  /** The coder is in a loop. */
  inLoop: boolean;
  /** In a loop: the unit of its history the coder is on. */
  currentUnitIndex: number | undefined;
  loop: (loop: CoderUnitLoopItem) => LoopNavigation;
  /** The questions of the unit the coder is in that they got to (`reachedQuestions`). */
  questions: NavigationUnitQuestion[];
}

/** The navigation menu's view of the session: its top-level steps, and for the loop the coder is in its units and questions. */
export function navigationSnapshot(at: NavigationInput): StudyManagerNavigation {
  return {
    canGoBack: at.canGoBack,
    canGoForward: at.canGoForward,
    phases: at.topSteps.map((step, index) => navigationPhase(at, step, index)),
    currentPhaseIndex: at.topIndex,
    currentUnitIndex: at.currentUnitIndex,
    maxReachedTopIndex: at.maxReachedTopIndex,
  };
}

function navigationPhase(at: NavigationInput, step: DesignItem, index: number): NavigationPhase {
  const isCurrent = index === at.topIndex;
  const phase: NavigationPhase = {
    index,
    name: step.type === "unit_loop" ? at.loop(step).key : (itemName(step) ?? ""),
    type: step.type as NavigationPhase["type"],
    label: stepLabel(step),
    isCurrent,
    isCompleted: index < at.topIndex,
    unitCount: undefined,
    totalUnits: undefined,
    currentUnitIndex: undefined,
    units: undefined,
    questions: undefined,
  };
  if (step.type !== "unit_loop") return phase;
  const { history, totalUnits } = at.loop(step);
  phase.unitCount = history.entries.length;
  phase.questionCount = loopQuestionNames(step).length;
  phase.totalUnits = totalUnits;
  if (isCurrent && at.inLoop) {
    phase.currentUnitIndex = history.index >= 0 ? history.index : 0;
    phase.units = history.entries.map((entry, i) => ({ index: i, id: entry.unitId, isCurrent: i === history.index }));
    phase.questions = at.questions;
  }
  return phase;
}

/**
 * The questions a unit shows (conditions applied) that the coder got to: up
 * to the current one, or up to the first unanswered one (as jumping to a
 * question allows). Later ones may never show (conditions).
 */
export function reachedQuestions(
  { steps, index }: Pick<OpenUnit, "steps" | "index">,
  isAnswered: (step: DesignItem) => boolean,
): NavigationUnitQuestion[] {
  const firstOpen = steps.findIndex((step) => !isAnswered(step));
  const reached = Math.max(index, firstOpen === -1 ? steps.length - 1 : firstOpen);
  return steps.flatMap((step, i) =>
    step.type === "question" && i <= reached
      ? [{ index: i, name: step.name, label: stepLabel(step), isCurrent: i === index, isCompleted: i < index }]
      : [],
  );
}
