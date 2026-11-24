import type { VariableValue } from "@annotinder/contracts";
import type { StudyManager } from "../../studyManager/StudyManager";
import type { StudyManagerSnapshot } from "../../studyManager/types";
import { dropRepeatedClick } from "../inputGuards";
import { Question } from "../Question";
import { practiceFeedback } from "./practiceFeedback";
import { QuestionPanel } from "./QuestionPanel";
import type { CurrentQuestion } from "./useCurrentQuestion";

/**
 * The current question with the session's state for it: the coder's earlier
 * answer to start from, and around it the feedback on a wrong practice
 * answer or a frozen answer's Continue (`QuestionPanel`).
 */
export function AnsweredQuestion({
  question,
  snapshot,
  manager,
  onAnswer,
}: {
  question: CurrentQuestion;
  snapshot: StudyManagerSnapshot;
  manager: StudyManager;
  onAnswer: (value: VariableValue) => void;
}) {
  const { item, inUnit } = question;
  const answers = inUnit ? snapshot.currentUnitVariables : snapshot.userVariableValues;
  return (
    <QuestionPanel
      answerField={
        // The second click of a double click doesn't answer the next question (inputGuards.ts)
        <div onClickCapture={dropRepeatedClick} className="contents">
          <Question
            // A fresh answer field per question and unit, starting from that answer
            key={`${snapshot.currentUnit?.id ?? ""}/${item.name}`}
            item={item}
            onAnswer={onAnswer}
            initialValue={answers?.[item.name]}
            unitVariables={snapshot.currentUnitVariables ?? undefined}
            texts={snapshot.currentTexts}
            onComment={(comment) => void manager.comment(item.name, comment)}
          />
        </div>
      }
      practiceWrong={practiceFeedback(snapshot, item.name)}
      onContinueAfterPractice={() => void manager.continueAfterPractice()}
      frozen={snapshot.currentFrozen}
      onContinueFrozen={() => onAnswer(snapshot.userVariableValues[item.name] ?? { done: true, skip: true })}
    />
  );
}
