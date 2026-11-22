import type { DesignItem, VariableValue } from "@annotinder/contracts";

export type QuestionItem = Extract<DesignItem, { type: "question" }>;
export type QuestionVariable = QuestionItem["variable"];

export interface AnswerFieldProps<TVariable extends QuestionVariable = QuestionVariable> {
  variable: TVariable;
  onAnswer: (value: VariableValue) => void;
  /**
   * This unit's answers so far (in a unit loop only): a relation question
   * finds the spans it links in them (docs/client.md §4 "Span and relation
   * answers").
   */
  unitVariables?: Record<string, VariableValue>;
  /** The coder's earlier answer, to start from when they come back to the question. */
  initialValue?: VariableValue;
}
