import { useMemo } from "react";
import type { VariableValue } from "@annotinder/contracts";
import { HttpCoderApi } from "../../api/httpCoderApi";
import { useBaseKeys } from "../../keyboard/hooks";
import { defaultTransferUrl } from "../../session/coderSession";
import type { StudyManager } from "../../studyManager/StudyManager";
import { useStudyManager } from "../../studyManager/useStudyManager";
import { SessionEnd } from "../SessionEnd";
import {
  useCodingDisplay,
  useDocumentTitle,
  useLeaveWarning,
  useNavDirection,
  usePracticeFlash,
  type NavDirection,
} from "./hooks";
import { QuestionScreen, type CodingMoves } from "./QuestionScreen";
import { LoadingScreen } from "./SessionNotice";
import { SessionErrorScreen } from "./SessionNotices";
import type { CodingScreenProps } from "./types";
import { useCurrentQuestion } from "./useCurrentQuestion";
import { useUnitSlide } from "./useUnitSlide";

/**
 * One session's coding screen: by the session's phase the loading screen,
 * an error, the end, or the current question (`QuestionScreen`).
 */
export function CodingScreen(props: CodingScreenProps) {
  const coderApi = useCoderApi(props);
  const { manager, snapshot } = useStudyManager(coderApi);
  const [navDirection, setNavDirection] = useNavDirection(snapshot.navigation);
  const [display, screenRef] = useCodingDisplay(snapshot, coderApi);
  const moves = codingMoves(manager, setNavDirection);
  // The keys that work whatever the mapping: arrows, Ctrl + arrows, Ctrl + Enter
  useBaseKeys({
    canGoBack: snapshot.navigation.canGoBack,
    canGoForward: snapshot.navigation.canGoForward,
    onBack: moves.back,
    onForward: moves.forward,
  });
  useLeaveWarning(snapshot.unsaved > 0);
  useDocumentTitle(snapshot.title);
  const correctFlash = usePracticeFlash(snapshot.practiceRight);
  // A new unit slides in from the side the coder moved to
  const currentUnitId = snapshot.currentUnit?.id ?? snapshot.navigation.currentUnitIndex ?? "none";
  const unitSlide = useUnitSlide(currentUnitId, navDirection);
  const question = useCurrentQuestion(snapshot);

  switch (snapshot.phase) {
    case "loading":
      return <LoadingScreen />;
    case "error":
      return (
        <SessionErrorScreen
          error={snapshot.error}
          errorCode={snapshot.errorCode}
          onRetry={() => void manager.retry()}
          onBackToUnit={snapshot.refusedUnit ? () => void manager.backToRefusedUnit() : undefined}
          onStartNewSession={props.onStartNewSession}
          canLogIn={snapshot.canLogIn}
          baseUrl={props.baseUrl}
          linkSecret={props.linkSecret}
          coderName={props.coderName}
          onPickName={props.onPickName}
        />
      );
    case "finished":
      return (
        <SessionEnd
          ending={snapshot.ending}
          quit={snapshot.quit}
          deletionRequested={snapshot.deletionRequested}
          onRequestDeletion={() => manager.quit(true)}
          reopen={snapshot.reopen}
          onReopen={() => manager.reopen()}
          preview={props.preview}
          homeUrl={props.homeUrl}
        />
      );
    case "user_variable":
    case "unit_variable":
      if (!question) return <UnexpectedState />;
      return (
        <QuestionScreen
          question={question}
          snapshot={snapshot}
          manager={manager}
          coderApi={coderApi}
          moves={moves}
          display={display}
          screenRef={screenRef}
          navDirection={navDirection}
          unitSlide={unitSlide}
          correctFlash={correctFlash}
          transferUrl={props.transferUrl ?? defaultTransferUrl}
          joinedByTransfer={props.joinedByTransfer}
          preview={props.preview}
        />
      );
  }
}

/** The session's API: the same one until what starts the session changes. */
function useCoderApi(props: CodingScreenProps): HttpCoderApi {
  const { baseUrl, linkSecret, urlParams, newSession, coderName, useLogin } = props;
  // By content: a new object with the same params must not restart the session.
  const urlParamsKey = JSON.stringify(urlParams ?? {});
  return useMemo(
    () =>
      new HttpCoderApi({ baseUrl, linkSecret, urlParams: JSON.parse(urlParamsKey), newSession, coderName, useLogin }),
    [baseUrl, linkSecret, urlParamsKey, newSession, coderName, useLogin],
  );
}

function codingMoves(manager: StudyManager, setNavDirection: (direction: NavDirection) => void): CodingMoves {
  return {
    back: () => {
      setNavDirection("previous");
      void manager.goBack();
    },
    forward: () => {
      setNavDirection("next");
      void manager.goForward();
    },
    answer: (value: VariableValue) => {
      setNavDirection("next");
      manager.answer(value);
    },
  };
}

function UnexpectedState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Unexpected session state.</p>
    </div>
  );
}
