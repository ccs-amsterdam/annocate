import type { CodebookItem, VariableValue } from "@annotinder/contracts";

export type QuestionItem = Extract<CodebookItem, { type: "user_variable" | "unit_variable" }>;
export type QuestionVariable = QuestionItem["variable"];

export interface AnswerFieldProps<TVariable extends QuestionVariable = QuestionVariable> {
  variable: TVariable;
  onAnswer: (value: VariableValue, conditionValue?: unknown) => void;
}
