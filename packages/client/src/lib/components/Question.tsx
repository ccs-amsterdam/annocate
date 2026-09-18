import type { CSSProperties, ReactNode } from "react";
import type { CodebookItem, VariableValue } from "@annotinder/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
}

function renderQuestionText(variable: QuestionItem["variable"]) {
  if (!("question" in variable)) return null;

  return (
    <CardTitle className="whitespace-pre-wrap text-2xl leading-tight" style={variable.questionStyle as CSSProperties | undefined}>
      {variable.question}
    </CardTitle>
  );
}

function renderInstruction(variable: QuestionItem["variable"]) {
  if (!("instruction" in variable) || !variable.instruction) return null;

  return (
    <CardDescription className="whitespace-pre-wrap text-sm leading-6" style={variable.instructionStyle as CSSProperties | undefined}>
      {variable.instruction}
    </CardDescription>
  );
}

export function Question({ item, onAnswer, unitVariables }: QuestionProps) {
  const { variable } = item;

  let answerField: ReactNode;
  switch (variable.type) {
    case "confirm":
      answerField = <ConfirmAnswerField variable={variable} onAnswer={onAnswer} />;
      break;
    case "select_code":
      answerField = <SelectCodeAnswerField variable={variable} onAnswer={onAnswer} />;
      break;
    case "scale":
      answerField = <ScaleAnswerField variable={variable} onAnswer={onAnswer} />;
      break;
    case "annotinder":
      answerField = <AnnotinderAnswerField variable={variable} onAnswer={onAnswer} />;
      break;
    case "search_code":
      answerField = <SearchCodeAnswerField variable={variable} onAnswer={onAnswer} />;
      break;
    case "span":
      answerField = <SpanAnswerField variable={variable} onAnswer={onAnswer} />;
      break;
    case "relation":
      answerField = <RelationAnswerField variable={variable} unitVariables={unitVariables} onAnswer={onAnswer} />;
      break;
    default:
      answerField = <UnsupportedAnswerField variable={variable} onAnswer={onAnswer} />;
      break;
  }

  return (
    <Card className="border bg-card/95 shadow-sm">
      <CardHeader className="gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{item.type.replace("_", " ")}</div>
        {renderQuestionText(variable)}
        {renderInstruction(variable)}
      </CardHeader>
      <CardContent>{answerField}</CardContent>
    </Card>
  );
}
