import {
  resolveVariable,
  type AnnotinderType,
  type OptionsContext,
  type RelationType,
  type SpanType,
  type UnitLayout,
} from "@annotinder/contracts";
import type { RenderedTemplate } from "../../codebook/renderTemplate";
import { useCoderSettings } from "../../context/coderSettings";
import type { StudyManagerSnapshot } from "../../studyManager/types";
import type { QuestionItem } from "../answerFields/types";
import { positionLabel } from "./hooks";

/** The question on screen, with what the coding screen derives from it. */
export interface CurrentQuestion {
  /** The question, in a unit loop with its options from data resolved for the unit. */
  item: QuestionItem;
  /** A question of a unit loop (else coder-level). */
  inUnit: boolean;
  /** Differs per question, unit and step: for the animations, and to tell whether a question is still on screen. */
  key: string;
  /** Answer shortcuts: the coder's choice, where the study allows them (its display setting). */
  answerKeys: boolean;
  /** The unit to show above the question: its layout, with the template's values filled in. Null without one. */
  unit: { layout: UnitLayout; rendered: RenderedTemplate } | null;
  /** In a unit loop: the variable of a span question, and of a relation question. */
  spanVariable: SpanType | null;
  relationVariable: RelationType | null;
  /** A swipe question: the unit (or the question card) is the card to swipe. */
  swipeVariable: AnnotinderType | null;
  /** What the question is about, by id: scrolled to when it comes up (docs/client.md §3, "Focus"). */
  focus?: string[];
  focusDim?: boolean;
}

/** The question the session is at (null without one: while loading, at the end). */
export function useCurrentQuestion(snapshot: StudyManagerSnapshot): CurrentQuestion | null {
  const { answerKeys: coderAnswerKeys } = useCoderSettings();
  if (!snapshot.currentItem || snapshot.currentItem.type !== "question") return null;

  const inUnit = snapshot.phase === "unit_variable";
  // Options from data: the unit's list field, or an earlier span question's spans (contracts optionsFrom.ts)
  const item = inUnit
    ? resolveVariableOf(snapshot.currentItem, {
        unit: snapshot.currentUnit?.data,
        answers: snapshot.currentUnitVariables ?? undefined,
        questions: snapshot.currentLoopVariables ?? undefined,
      })
    : snapshot.currentItem;
  const { variable } = item;
  const allowed = snapshot.display.answerKeys?.[inUnit ? "unitQuestions" : "coderQuestions"] !== false;
  const spanVariable = inUnit && variable.type === "span" ? variable : null;
  const unitId = snapshot.currentUnit?.id ?? snapshot.navigation.currentUnitIndex ?? "global";

  return {
    item,
    inUnit,
    key: `var-${item.name}-${unitId}-${positionLabel(snapshot)}`,
    answerKeys: coderAnswerKeys && allowed,
    unit: inUnit ? unitOf(snapshot) : null,
    spanVariable,
    relationVariable: inUnit && variable.type === "relation" ? variable : null,
    swipeVariable: variable.type === "annotinder" ? variable : null,
    focus: ("focus" in variable ? variable.focus : undefined) ?? spanVariable?.fields.map((f) => `unit.${f}`),
    focusDim: "focusDim" in variable ? variable.focusDim : undefined,
  };
}

function unitOf(snapshot: StudyManagerSnapshot): CurrentQuestion["unit"] {
  const { currentUnit, currentUnitLayout, currentUnitTemplate } = snapshot;
  if (!currentUnit || !currentUnitLayout || !currentUnitTemplate) return null;
  return { layout: currentUnitLayout, rendered: currentUnitTemplate };
}

/** A question item with its options from data resolved for the unit on screen. */
function resolveVariableOf<T extends { variable: unknown }>(item: T, ctx: OptionsContext): T {
  const variable = resolveVariable(item.variable, ctx);
  return variable === item.variable ? item : { ...item, variable };
}
