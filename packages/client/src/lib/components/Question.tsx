import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { MAX_COMMENT_LENGTH, type VariableValue } from "@annotinder/contracts";
import { Textarea } from "@/components/ui/textarea";
import {
  SwipeAnswerField,
  CategoricalAnswerField,
  ConfirmAnswerField,
  NumericAnswerField,
  RelationAnswerField,
  ScaleAnswerField,
  SpanAnswerField,
  TextAnswerField,
  UnsupportedAnswerField,
} from "./answerFields";
import { useSpanAnnotation } from "../context/spanAnnotation";
import { useFocusAfterBack } from "../keyboard/hooks";
import { staticTemplate, type RenderedTemplate } from "../codebook/renderTemplate";
import { TemplateMarkdown } from "./TemplateMarkdown";
import { QuestionInstruction } from "./QuestionInstruction";
import { isHeadingQuestion } from "./questionHeading";
import type { QuestionTexts } from "../studyManager/types";

import type { QuestionItem } from "./answerFields/types";

interface QuestionProps {
  /** A question: its variable, and in a unit loop its instruction. */
  item: Pick<QuestionItem, "variable"> & { name?: string; instruction?: string; comments?: boolean };
  onAnswer: (value: VariableValue) => void;
  /** This unit's answers so far (see `AnswerFieldProps.unitVariables`). */
  unitVariables?: Record<string, VariableValue>;
  /** The coder's earlier answer to this question, to start from (going back). */
  initialValue?: VariableValue;
  /** The question and instruction texts with their values filled in (StudyManager); without, values show their source. */
  texts?: QuestionTexts | null;
  /** A comment changed after answering (the comment box left): saved with the answer, without moving on. */
  onComment?: (comment: string) => void;
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

export function Question({ item, onAnswer: answer, unitVariables, initialValue, texts, onComment }: QuestionProps) {
  const { variable } = item;
  const spanAnnotation = useSpanAnnotation();
  useFocusAfterBack();
  // A comment on the answer (`comments`); span and relation questions comment on each span or relation instead
  const commentable = Boolean(item.comments) && variable.type !== "span" && variable.type !== "relation";
  const [comment, setComment] = useState(initialValue?.comment ?? "");
  const [commenting, setCommenting] = useState(Boolean(initialValue?.comment));
  const onAnswer = (value: VariableValue) =>
    answer(commentable && comment.trim() ? { ...value, comment: comment.trim() } : value);

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
    case "swipe":
      answerField = <SwipeAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
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
          comments={item.comments}
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
          {commentable && (
            <button
              type="button"
              aria-pressed={commenting}
              aria-label="Add a comment"
              title="Add a comment to your answer"
              onClick={() => setCommenting(!commenting)}
              className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted ${
                commenting || comment ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          )}
          {item.instruction && (
            <QuestionInstruction
              name={item.name ?? ""}
              instruction={texts?.instruction ?? staticTemplate(item.instruction)}
              openNow={texts?.openInstruction}
            />
          )}
        </div>
      )}
      {commentable && commenting && (
        <Textarea
          aria-label="Comment"
          autoFocus={!comment}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="A comment on your answer"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          // Already answered: the comment is saved when the box is left (answering also takes it)
          onBlur={() => initialValue && !initialValue.skip && onComment?.(comment.trim())}
          className="min-h-14 text-sm"
        />
      )}
      <div className={hideHeader ? "" : "pt-0.5"}>{answerField}</div>
    </div>
  );
}
