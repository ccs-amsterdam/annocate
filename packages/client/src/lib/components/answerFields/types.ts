import type { CodebookItem, VariableValue } from "@annotinder/contracts";

export type QuestionItem = Extract<CodebookItem, { type: "question" | "user_variable" | "unit_variable" }>;
export type QuestionVariable = QuestionItem["variable"];

export interface AnswerFieldProps<TVariable extends QuestionVariable = QuestionVariable> {
  variable: TVariable;
  onAnswer: (value: VariableValue) => void;
  /**
   * This unit's variable answers submitted so far (docs/client.md §4
   * relation UI) -- only populated for questions in a unit loop, and only
   * actually used by `RelationAnswerField` to look up a sibling `span`
   * variable's already-collected spans.
   */
  unitVariables?: Record<string, VariableValue>;
  /**
   * Any previously-submitted answer for this variable, allowing the coder
   * to review or update their previous answer when navigating backwards.
   */
  initialValue?: VariableValue;
}
