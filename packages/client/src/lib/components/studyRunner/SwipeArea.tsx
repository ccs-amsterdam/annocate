import type { ReactNode } from "react";
import type { VariableValue } from "@annotinder/contracts";
import { buildValues } from "../answerFields/answerValue";
import { SwipeProvider } from "../SwipeCard";
import type { CurrentQuestion } from "./useCurrentQuestion";

/**
 * Around the card and the answer field of a swipe question: swiping the
 * card answers it. Any other question is shown as it is.
 */
export function SwipeArea({
  question,
  onAnswer,
  children,
}: {
  question: CurrentQuestion;
  onAnswer: (value: VariableValue) => void;
  children: ReactNode;
}) {
  if (!question.swipeVariable) return <>{children}</>;
  return (
    <SwipeProvider
      question={question.key}
      options={question.swipeVariable.options}
      onAnswer={(option) => onAnswer(buildValues([{ value: option.value }]))}
    >
      {children}
    </SwipeProvider>
  );
}
