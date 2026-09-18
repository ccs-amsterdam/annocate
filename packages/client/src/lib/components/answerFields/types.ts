import type { CodebookItem, VariableValue } from "@annotinder/contracts";

export type QuestionItem = Extract<CodebookItem, { type: "user_variable" | "unit_variable" }>;
export type QuestionVariable = QuestionItem["variable"];

export interface AnswerFieldProps<TVariable extends QuestionVariable = QuestionVariable> {
  variable: TVariable;
  onAnswer: (value: VariableValue, conditionValue?: unknown) => void;
  /**
   * This unit's variable answers submitted so far (design plan §4.3
   * relation UI) -- only populated for `unit_variable` items, and only
   * actually used by `RelationAnswerField` to look up a sibling `span`
   * variable's already-collected spans.
   */
  unitVariables?: Record<string, VariableValue>;
}
