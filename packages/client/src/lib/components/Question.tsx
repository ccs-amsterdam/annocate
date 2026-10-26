import type { CSSProperties, ReactNode } from "react";
import type { VariableValue } from "@annotinder/contracts";
import {
  AnnotinderAnswerField,
  CategoricalAnswerField,
  ConfirmAnswerField,
  NumericAnswerField,
  RelationAnswerField,
  ScaleAnswerField,
  SpanAnswerField,
  UnsupportedAnswerField,
} from "./answerFields";
import { useSpanAnnotation } from "../context/SpanAnnotationContext";
import { staticTemplate, type RenderedTemplate } from "../codebook/renderTemplate";
import { TemplateMarkdown } from "./TemplateMarkdown";

import type { QuestionItem } from "./answerFields/types";

interface QuestionProps {
  /** A question (or a legacy user/unit variable item): only its variable is used. */
  item: Pick<QuestionItem, "variable">;
  onAnswer: (value: VariableValue) => void;
  /** This unit's variable answers submitted so far -- see `AnswerFieldProps.unitVariables`. */
  unitVariables?: Record<string, VariableValue>;
  /** Any previously submitted answer for this question -- for review or editing */
  initialValue?: VariableValue;
  /** The question and instruction texts with their values filled in (JobManager); without, values show their source. */
  texts?: QuestionTexts | null;
}

/** A question's texts, rendered as templates (docs/client.md §3). */
export interface QuestionTexts {
  question?: RenderedTemplate;
  instruction?: RenderedTemplate;
}

const TEXT_COMPONENTS = { p: ({ children }: { children?: ReactNode }) => <p className="m-0">{children}</p> };

function renderQuestionText(variable: QuestionItem["variable"], rendered?: RenderedTemplate) {
  if (!("question" in variable) || !variable.question) return null;

  return (
    <div
      className="flex flex-col gap-1 text-base sm:text-lg font-semibold leading-snug tracking-tight text-foreground"
      style={variable.questionStyle as CSSProperties | undefined}
    >
      <TemplateMarkdown rendered={rendered ?? staticTemplate(variable.question)} components={TEXT_COMPONENTS} />
    </div>
  );
}

function renderInstruction(variable: QuestionItem["variable"], rendered?: RenderedTemplate) {
  if (!("instruction" in variable) || !variable.instruction) return null;

  return (
    <div
      className="flex flex-col gap-1 text-xs sm:text-sm text-muted-foreground leading-normal"
      style={variable.instructionStyle as CSSProperties | undefined}
    >
      <TemplateMarkdown rendered={rendered ?? staticTemplate(variable.instruction)} components={TEXT_COMPONENTS} />
    </div>
  );
}

export function Question({ item, onAnswer, unitVariables, initialValue, texts }: QuestionProps) {
  const { variable } = item;
  const spanAnnotation = useSpanAnnotation();

  // Keep docked card compact: hide question header when inspecting/assigning a selected span
  // or when viewing the full list of labeled spans
  const hideHeader =
    variable.type === "span" &&
    (Boolean(spanAnnotation?.pendingSpan) || Boolean(spanAnnotation?.isViewingAllLabels));

  let answerField: ReactNode;
  switch (variable.type) {
    case "confirm":
      answerField = <ConfirmAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "categorical":
      answerField = <CategoricalAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "numeric":
      answerField = <NumericAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "scale":
      answerField = <ScaleAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "annotinder":
      answerField = <AnnotinderAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "span":
      answerField = <SpanAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "relation":
      answerField = <RelationAnswerField variable={variable} unitVariables={unitVariables} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    default:
      answerField = <UnsupportedAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      {!hideHeader && (
        <div className="flex flex-col gap-0.5">
          {renderQuestionText(variable, texts?.question)}
          {renderInstruction(variable, texts?.instruction)}
        </div>
      )}
      <div className={hideHeader ? "" : "pt-0.5"}>{answerField}</div>
    </div>
  );
}
