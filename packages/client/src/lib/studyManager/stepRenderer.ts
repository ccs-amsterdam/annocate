import type {
  AnswerAlternative,
  AnyVariableType,
  CoderUnitLoopItem,
  CoderUnitResponse,
  DesignItem,
  LayoutItem,
  ReferenceScope,
} from "@annotinder/contracts";
import { loopLayouts, loopSnippets } from "@annotinder/contracts";
import type { ExpressionCache } from "../codebook/expressionCache";
import { renderTemplate, staticTemplate, type RenderedTemplate } from "../codebook/renderTemplate";
import { spanColumns } from "../codebook/tree";
import { loopQuestionNames } from "./items";
import { expectedAnswerText } from "./practice";
import type { QuestionTexts } from "./types";

// What a step shows, with its values filled in: the templates of the design
// rendered for the scope (answers, the unit's data, the session's values).

/**
 * A question's texts (in a loop, with its snippets). `opens`: asked, when
 * there is an instruction, whether it opens by itself now.
 */
export async function renderQuestionTexts(
  item: DesignItem | undefined,
  scope: ReferenceScope,
  cache: ExpressionCache,
  { snippets, opens }: { snippets?: Record<string, string>; opens?: () => boolean } = {},
): Promise<QuestionTexts | null> {
  if (!item || !("variable" in item) || !("question" in item.variable)) return null;
  const { question } = item.variable;
  const instruction = "instruction" in item ? item.instruction : undefined;
  const [questionText, instructionText] = await Promise.all([
    question ? renderTemplate(question, scope, cache, `question:${item.name}`, { snippets }) : undefined,
    instruction ? renderTemplate(instruction, scope, cache, `instruction:${item.name}`, { snippets }) : undefined,
  ]);
  return {
    question: questionText,
    instruction: instructionText,
    ...(instructionText && opens?.() ? { openInstruction: true } : {}),
  };
}

/** A step of a unit loop, to show a unit with. */
export interface LoopStep {
  loop: CoderUnitLoopItem;
  loopKey: string;
  step: DesignItem | undefined;
  /** The layout this step shows the unit with; none: the question alone. */
  layout: LayoutItem | null;
}

/** The unit's layout as a step of its loop shows it; null without a layout. */
export function renderUnitLayout(
  { loop, loopKey, step, layout }: LoopStep,
  scope: ReferenceScope,
  cache: ExpressionCache,
): Promise<RenderedTemplate> | null {
  if (!layout) return null;
  const cacheKey = `layout:${loopKey}:${loopLayouts(loop.children).indexOf(layout)}`;
  return renderTemplate(layout.template, scope, cache, cacheKey, {
    progress: { current: step && "name" in step ? step.name : null, order: loopQuestionNames(loop) },
    snippets: layout.snippets,
    selectable: spanColumns(loop),
  });
}

/** The texts of a loop's question: they may use any of the loop's snippets. */
export function renderLoopQuestionTexts(
  { loop, step }: LoopStep,
  scope: ReferenceScope,
  cache: ExpressionCache,
  opens?: () => boolean,
): Promise<QuestionTexts | null> {
  return renderQuestionTexts(step, scope, cache, { snippets: loopSnippets(loop.children), opens });
}

/**
 * The feedback on a wrong practice answer: the question's own message, else
 * the unit's (a template), else the expected answer.
 */
export async function renderPracticeFeedback(
  unit: CoderUnitResponse,
  question: { name: string; variable: AnyVariableType | undefined; key: AnswerAlternative[] },
  scope: ReferenceScope,
  cache: ExpressionCache,
): Promise<RenderedTemplate> {
  const own = unit.practice?.questions[question.name]?.message;
  if (own) return staticTemplate(own);
  if (unit.practice?.message) return renderTemplate(unit.practice.message, scope, cache, `practice:${question.name}`);
  return staticTemplate(expectedAnswerText(question.name, question.variable, question.key));
}
