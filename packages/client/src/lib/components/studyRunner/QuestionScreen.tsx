import type { VariableValue } from "@annotinder/contracts";
import type { CoderApi } from "../../api/httpCoderApi";
import { DisplayContext, type DisplayState } from "../../display/context";
import { AnswerKeysContext } from "../../keyboard/context";
import type { StudyManager } from "../../studyManager/StudyManager";
import type { StudyManagerSnapshot } from "../../studyManager/types";
import { KeyChoiceFlash } from "../KeyChoiceFlash";
import { AnsweredQuestion } from "./AnsweredQuestion";
import { CoderQuestionCard } from "./CoderQuestionCard";
import { CodingTopBar } from "./CodingTopBar";
import { WaitingForConnection } from "./ConnectionNotices";
import type { NavDirection } from "./hooks";
import { NewUnitsBanner } from "./NewUnitsBanner";
import { PracticeCorrectFlash } from "./PracticeCorrectFlash";
import { UnitQuestionLayout } from "./UnitQuestionLayout";
import type { CurrentQuestion } from "./useCurrentQuestion";
import type { useUnitSlide } from "./useUnitSlide";

/** The coder's moves from the coding screen: each also sets the direction of the slide. */
export interface CodingMoves {
  back: () => void;
  forward: () => void;
  answer: (value: VariableValue) => void;
}

interface QuestionScreenProps {
  question: CurrentQuestion;
  snapshot: StudyManagerSnapshot;
  manager: StudyManager;
  coderApi: CoderApi;
  moves: CodingMoves;
  display: DisplayState;
  /** Put on the coding area: its width is measured (`useCodingDisplay`). */
  screenRef: (el: HTMLElement | null) => void;
  navDirection: NavDirection;
  unitSlide: ReturnType<typeof useUnitSlide>;
  /** Flash "Correct" now (`usePracticeFlash`). */
  correctFlash: boolean;
  transferUrl: (token: string) => string;
  preview?: boolean;
}

/**
 * The coding screen at a question: the top bar, and the question. In a
 * unit loop the unit scrolls above and the question is docked below it
 * (`UnitQuestionLayout`); a coder-level question is a card in the middle
 * (`CoderQuestionCard`).
 */
export function QuestionScreen({
  question,
  snapshot,
  manager,
  coderApi,
  moves,
  display,
  screenRef,
  navDirection,
  unitSlide,
  correctFlash,
  transferUrl,
  preview,
}: QuestionScreenProps) {
  const slideClass = navDirection === "next" ? "animate-slide-in-right" : "animate-slide-in-left";
  const answeredQuestion = (
    <AnsweredQuestion question={question} snapshot={snapshot} manager={manager} onAnswer={moves.answer} />
  );

  return (
    <DisplayContext.Provider value={display}>
      <AnswerKeysContext.Provider value={question.answerKeys}>
        {/* A container: the layout follows the coding area's width, not the window's (a phone-sized preview on a desktop) */}
        <div ref={screenRef} className="@container flex h-full w-full flex-col overflow-hidden bg-background">
          {correctFlash && <PracticeCorrectFlash />}
          <KeyChoiceFlash />
          <CodingTopBar
            snapshot={snapshot}
            manager={manager}
            coderApi={coderApi}
            transferUrl={transferUrl}
            preview={preview}
            onBack={moves.back}
            onForward={moves.forward}
          />
          {snapshot.retrying && <WaitingForConnection />}
          {snapshot.newUnits && (
            <NewUnitsBanner message={snapshot.newUnits} onDismiss={() => manager.dismissNewUnits()} />
          )}
          {question.unit ? (
            <UnitQuestionLayout
              question={question}
              unit={question.unit}
              snapshot={snapshot}
              unitSlide={unitSlide}
              slideClass={slideClass}
              onAnswer={moves.answer}
            >
              {answeredQuestion}
            </UnitQuestionLayout>
          ) : (
            <CoderQuestionCard question={question} slideClass={slideClass} onAnswer={moves.answer}>
              {answeredQuestion}
            </CoderQuestionCard>
          )}
        </div>
      </AnswerKeysContext.Provider>
    </DisplayContext.Provider>
  );
}
