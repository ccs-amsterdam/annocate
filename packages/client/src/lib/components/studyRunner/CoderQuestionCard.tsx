import type { ReactNode } from "react";
import type { VariableValue } from "@annotinder/contracts";
import { SwipeCard, SwipeSurface } from "../SwipeCard";
import { SwipeArea } from "./SwipeArea";
import type { CurrentQuestion } from "./useCurrentQuestion";

/** A question without a unit (coder-level): a card in the middle. */
export function CoderQuestionCard({
  question,
  slideClass,
  onAnswer,
  children,
}: {
  question: CurrentQuestion;
  /** The slide the question comes in with. */
  slideClass: string;
  onAnswer: (value: VariableValue) => void;
  /** The question with its answer field. */
  children: ReactNode;
}) {
  return (
    <SwipeArea question={question} onAnswer={onAnswer}>
      <SwipeSurface className="flex flex-1 items-center justify-center overflow-x-hidden overflow-y-auto p-4 sm:p-8">
        <div key={question.key} className={`mx-auto w-full max-w-xl ${slideClass}`}>
          <SwipeCard className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">{children}</SwipeCard>
        </div>
      </SwipeSurface>
    </SwipeArea>
  );
}
