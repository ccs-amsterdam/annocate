import { TextAnswerField } from "./answerFields/TextAnswerField";
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
import { useSpanAnnotation } from "../context/spanAnnotation";
import { staticTemplate, type RenderedTemplate } from "../codebook/renderTemplate";
import { TemplateMarkdown } from "./TemplateMarkdown";
import { QuestionInstruction } from "./QuestionInstruction";
import { isHeadingQuestion } from "./questionHeading";

import type { QuestionItem } from "./answerFields/types";

interface QuestionProps {
  /** A question: its variable, and in a unit loop its instruction. */
  item: Pick<QuestionItem, "variable"> & { name?: string; instruction?: string };
  onAnswer: (value: VariableValue) => void;
  /** This unit's answers so far (see `AnswerFieldProps.unitVariables`). */
  unitVariables?: Record<string, VariableValue>;
  /** The coder's earlier answer to this question, to start from (going back). */
  initialValue?: VariableValue;
  /** The question and instruction texts with their values filled in (StudyManager); without, values show their source. */
  texts?: QuestionTexts | null;
}

/** A question's texts, rendered as templates (docs/client.md §4 "Questions and instructions"). */
export interface QuestionTexts {
  question?: RenderedTemplate;
  /** In a unit loop: how to apply the question, opened from the question (? button or key). */
  instruction?: RenderedTemplate;
  /** The instruction opens by itself now (`instructionOpen`). */
  openInstruction?: boolean;
}

const TEXT_COMPONENTS = { p: ({ children }: { children?: ReactNode }) => <p className="m-0">{children}</p> };

/** The question's text: a short one-paragraph question as a heading, else its markdown as written (questionHeading.ts). */
function renderQuestionText(variable: QuestionItem["variable"], rendered?: RenderedTemplate) {
  if (!("question" in variable) || !variable.question) return null;
  const heading = isHeadingQuestion(variable.question);
  return (
    <div
      className={
        heading
          ? "flex flex-col gap-1 text-base leading-snug font-semibold tracking-tight text-foreground sm:text-lg"
          : "template-markdown flex flex-col gap-2 text-sm leading-normal text-foreground sm:text-base"
      }
      style={variable.questionStyle as CSSProperties | undefined}
    >
      <TemplateMarkdown
        rendered={rendered ?? staticTemplate(variable.question)}
        components={heading ? TEXT_COMPONENTS : undefined}
      />
    </div>
  );
}

export function Question({ item, onAnswer, unitVariables, initialValue, texts }: QuestionProps) {
  const { variable } = item;
  const spanAnnotation = useSpanAnnotation();

  // A span question labelling a selection, or listing its spans, needs the room: no question text then
  const hideHeader =
    variable.type === "span" && (Boolean(spanAnnotation?.pendingSpan) || Boolean(spanAnnotation?.isViewingAllLabels));

  let answerField: ReactNode;
  switch (variable.type) {
    case "confirm":
      answerField = <ConfirmAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "text":
      answerField = <TextAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "nominal":
    case "ordinal":
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
      answerField = (
        <RelationAnswerField
          variable={variable}
          unitVariables={unitVariables}
          onAnswer={onAnswer}
          initialValue={initialValue}
        />
      );
      break;
    default:
      answerField = <UnsupportedAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {!hideHeader && (
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">{renderQuestionText(variable, texts?.question)}</div>
          {item.instruction && (
            <QuestionInstruction
              name={item.name ?? ""}
              instruction={texts?.instruction ?? staticTemplate(item.instruction)}
              openNow={texts?.openInstruction}
            />
          )}
        </div>
      )}
      <div className={hideHeader ? "" : "pt-0.5"}>{answerField}</div>
    </div>
  );
}
