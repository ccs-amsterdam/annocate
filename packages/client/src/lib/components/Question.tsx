import type { CSSProperties, ReactNode } from "react";
import type { CodebookItem, VariableValue } from "@annotinder/contracts";
import {
  AnnotinderAnswerField,
  ConfirmAnswerField,
  RelationAnswerField,
  ScaleAnswerField,
  SearchCodeAnswerField,
  SelectCodeAnswerField,
  SpanAnswerField,
  UnsupportedAnswerField,
} from "./answerFields";

type QuestionItem = Extract<CodebookItem, { type: "user_variable" | "unit_variable" }>;

interface QuestionProps {
  item: QuestionItem;
  onAnswer: (value: VariableValue, conditionValue?: unknown) => void;
  /** This unit's variable answers submitted so far -- see `AnswerFieldProps.unitVariables`. */
  unitVariables?: Record<string, VariableValue>;
  /** Any previously submitted answer for this question -- for review or editing */
  initialValue?: VariableValue;
}

function renderQuestionText(variable: QuestionItem["variable"]) {
  if (!("question" in variable) || !variable.question) return null;

  return (
    <h3
      className="whitespace-pre-wrap text-base sm:text-lg font-semibold leading-snug tracking-tight text-foreground"
      style={variable.questionStyle as CSSProperties | undefined}
    >
      {variable.question}
    </h3>
  );
}

function renderInstruction(variable: QuestionItem["variable"]) {
  if (!("instruction" in variable) || !variable.instruction) return null;

  return (
    <p
      className="whitespace-pre-wrap text-xs sm:text-sm text-muted-foreground leading-normal"
      style={variable.instructionStyle as CSSProperties | undefined}
    >
      {variable.instruction}
    </p>
  );
}

export function Question({ item, onAnswer, unitVariables, initialValue }: QuestionProps) {
  const { variable } = item;

  let answerField: ReactNode;
  switch (variable.type) {
    case "confirm":
      answerField = <ConfirmAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "select_code":
      answerField = <SelectCodeAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "scale":
      answerField = <ScaleAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "annotinder":
      answerField = <AnnotinderAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
      break;
    case "search_code":
      answerField = <SearchCodeAnswerField variable={variable} onAnswer={onAnswer} initialValue={initialValue} />;
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
      <div className="flex flex-col gap-0.5">
        {renderQuestionText(variable)}
        {renderInstruction(variable)}
      </div>
      <div className="pt-0.5">{answerField}</div>
    </div>
  );
}
