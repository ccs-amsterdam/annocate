import { useState, useMemo, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { RelationType, VariableValue } from "@annotinder/contracts";
import { CircleCheck, Sparkles, X } from "lucide-react";
import { HttpCoderApi } from "../api/httpCoderApi";
import { defaultTransferUrl, redeemTransfer, type CoderSessionScope } from "../session/coderSession";
import { useStudyManager } from "../studyManager/useStudyManager";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
import { RelationAnnotationProvider } from "../context/RelationAnnotationContext";
import { RelationArrows } from "./RelationArrows";
import { CoderSettingsProvider } from "../context/CoderSettingsContext";
import { KeyboardProvider } from "../keyboard/KeyboardProvider";
import { useBaseKeys } from "../keyboard/hooks";
import { DisplayContext } from "../display/context";
import { Question } from "./Question";
import { UnitFields } from "./UnitFields";
import { DockedAnswerPane } from "./DockedAnswerPane";
import { SessionEnd } from "./SessionEnd";
import { SwipeCard, SwipeProvider, SwipeSurface } from "./SwipeCard";
import { buildValues } from "./answerFields/answerValue";
import { dropRepeatedClick } from "./inputGuards";
import { CodingTopBar } from "./studyRunner/CodingTopBar";
import { QuestionPanel } from "./studyRunner/QuestionPanel";
import { LoadingScreen, SessionErrorScreen, SessionNotice } from "./studyRunner/SessionNotices";
import {
  positionLabel,
  useCodingDisplay,
  useDocumentTitle,
  useLeaveWarning,
  useNavDirection,
  usePracticeFlash,
} from "./studyRunner/hooks";

export interface StudyRunnerProps {
  /** Server URL including the deployment, e.g. `/api/d/42` (same origin as the client). */
  baseUrl: string;
  linkSecret?: string;
  /** The page's other query parameters: the coder id and the design's URL parameters (the server stores the ones it needs when the coder starts). */
  urlParams?: Record<string, string>;
  /** Token from a "Continue on another device" link: redeemed for the session's coder key. */
  transferToken?: string;
  /** Called once a transfer token was redeemed, e.g. to remove it from the URL. */
  onTransferRedeemed?: () => void;
  /** Builds the link shown for "Continue on another device". Defaults to this page with `?transfer=<token>`. */
  transferUrl?: (token: string) => string;
  onFinished?: () => void;
  preview?: boolean;
  /** Start a new session rather than continue this browser's (e.g. resetting a preview). */
  newSession?: boolean;
  /** The coder's overview of their studies, linked from the end screen. */
  homeUrl?: string;
}

/**
 * The coding screen (docs/client.md §2): runs a coder's session against the
 * server and shows the current step, driven by `StudyManager`.
 */
export function StudyRunner(props: StudyRunnerProps) {
  return (
    <CoderSettingsProvider>
      <KeyboardProvider>
        <CoderSessionGate {...props} />
      </KeyboardProvider>
    </CoderSettingsProvider>
  );
}

/**
 * Gets the session ready before coding starts: redeems a transfer link (the
 * server adds this device to the session), and starts a new session on
 * request. The server finds the session by the device cookie, set on the
 * first visit. See docs/coder-identity.md §4.
 */
function CoderSessionGate(props: StudyRunnerProps) {
  const { baseUrl, linkSecret, transferToken, onTransferRedeemed, newSession = false } = props;
  const scope = useMemo<CoderSessionScope>(() => ({ baseUrl, linkSecret }), [baseUrl, linkSecret]);
  const [session, setSession] = useState<{
    ready: boolean;
    /** Bumped to start over with a fresh coding screen (a new session, or a name picked). */
    generation: number;
    newSession: boolean;
    coderName?: string;
    error: string | null;
  }>(() => ({ ready: !transferToken, generation: 0, newSession, error: null }));

  useEffect(() => {
    if (!transferToken) return;
    let cancelled = false;
    redeemTransfer(scope, transferToken)
      .then(() => {
        if (cancelled) return;
        setSession((s) => ({ ...s, ready: true }));
        onTransferRedeemed?.();
      })
      .catch((err: unknown) => {
        if (!cancelled) setSession((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, [transferToken, scope, onTransferRedeemed]);

  if (session.error) {
    return (
      <SessionNotice title="This link can't be used">
        <p>{session.error}</p>
        <p>
          Links to continue on another device work once and expire after 15 minutes. Make a new one on the device you
          started on.
        </p>
      </SessionNotice>
    );
  }
  if (!session.ready) return <LoadingScreen />;

  // The server moves this device to a new session on the first request.
  const startNewSession = () => setSession((s) => ({ ...s, generation: s.generation + 1, newSession: true }));

  return (
    <CodingScreen
      key={session.generation}
      {...props}
      newSession={session.newSession}
      onStartNewSession={startNewSession}
      coderName={session.coderName}
      onPickName={(coderName) => setSession((s) => ({ ...s, generation: s.generation + 1, coderName }))}
    />
  );
}

interface CodingScreenProps extends StudyRunnerProps {
  newSession: boolean;
  onStartNewSession: () => void;
  /** On a pick-your-name link: the name picked, and picking (again). */
  coderName?: string;
  onPickName: (name: string) => void;
}

/**
 * One session's coding screen: the top bar, and the current question. In a
 * unit loop the unit scrolls above and the question is docked below it,
 * near the thumbs (`DockedAnswerPane`); a coder-level question is a card in
 * the middle.
 */
function CodingScreen({
  baseUrl,
  linkSecret,
  urlParams,
  newSession,
  onStartNewSession,
  coderName,
  onPickName,
  transferUrl,
  preview,
  onFinished,
  homeUrl,
}: CodingScreenProps) {
  // By content: a new object with the same params must not restart the session.
  const urlParamsKey = JSON.stringify(urlParams ?? {});
  const coderApi = useMemo(
    () => new HttpCoderApi({ baseUrl, linkSecret, urlParams: JSON.parse(urlParamsKey), newSession, coderName }),
    [baseUrl, linkSecret, urlParamsKey, newSession, coderName],
  );
  const { manager, snapshot } = useStudyManager(coderApi);
  const [navDirection, setNavDirection] = useNavDirection(snapshot.navigation);
  const [display, screen] = useCodingDisplay(snapshot, coderApi);

  const goBack = () => {
    setNavDirection("previous");
    void manager.goBack();
  };
  const goForward = () => {
    setNavDirection("next");
    void manager.goForward();
  };
  // The keys that work whatever the mapping: arrows, Shift + arrows, Shift + Enter
  useBaseKeys({
    canGoBack: snapshot.navigation.canGoBack,
    canGoForward: snapshot.navigation.canGoForward,
    onBack: goBack,
    onForward: goForward,
  });

  useLeaveWarning(snapshot.unsaved > 0);
  useDocumentTitle(snapshot.title);
  const correctFlash = usePracticeFlash(snapshot.practiceRight);

  // A new unit slides in from the side the coder moved to
  const currentUnitId = snapshot.currentUnit?.id ?? snapshot.navigation.currentUnitIndex ?? "none";
  const prevUnitIdRef = useRef<number | string | null>(currentUnitId);
  /** The unit's content: relation arrows are positioned against it. */
  const unitContentRef = useRef<HTMLDivElement>(null);
  const [unitAnimationKey, setUnitAnimationKey] = useState<string>(() => `unit-${currentUnitId}`);
  const [unitSlideClass, setUnitSlideClass] = useState<string>("");
  useEffect(() => {
    if (prevUnitIdRef.current !== currentUnitId) {
      prevUnitIdRef.current = currentUnitId;
      setUnitAnimationKey(`unit-${currentUnitId}-${Date.now()}`);
      setUnitSlideClass(navDirection === "next" ? "animate-slide-in-right" : "animate-slide-in-left");
    }
  }, [currentUnitId, navDirection]);

  if (snapshot.phase === "loading") return <LoadingScreen />;

  if (snapshot.phase === "error") {
    return (
      <SessionErrorScreen
        error={snapshot.error}
        errorCode={snapshot.errorCode}
        onRetry={() => void manager.retry()}
        onStartNewSession={onStartNewSession}
        baseUrl={baseUrl}
        linkSecret={linkSecret}
        coderName={coderName}
        onPickName={onPickName}
      />
    );
  }

  if (snapshot.phase === "finished") {
    return (
      <SessionEnd
        ending={snapshot.ending}
        quit={snapshot.quit}
        deletionRequested={snapshot.deletionRequested}
        onRequestDeletion={() => manager.quit(true)}
        reopen={snapshot.reopen}
        onReopen={() => manager.reopen()}
        preview={preview}
        onFinished={onFinished}
        homeUrl={homeUrl}
      />
    );
  }

  if (!snapshot.currentItem || snapshot.currentItem.type !== "question") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Unexpected session state.</p>
      </div>
    );
  }

  const item = snapshot.currentItem;
  const inUnit = snapshot.phase === "unit_variable";
  const hasUnitLayout = Boolean(
    inUnit && snapshot.currentUnit && snapshot.currentUnitLayout && snapshot.currentUnitTemplate,
  );
  const spanVariable = inUnit && item.variable.type === "span" ? item.variable : null;
  const relationVariable = inUnit && item.variable.type === "relation" ? item.variable : null;

  const handleAnswer = (value: VariableValue) => {
    setNavDirection("next");
    manager.answer(value);
  };

  const questionElement = (
    <QuestionPanel
      answerField={
        // The second click of a double click doesn't answer the next question (inputGuards.ts)
        <div onClickCapture={dropRepeatedClick} className="contents">
          <Question
            // A fresh answer field per question and unit, starting from that answer
            key={`${snapshot.currentUnit?.id ?? ""}/${item.name}`}
            item={item}
            onAnswer={handleAnswer}
            initialValue={inUnit ? snapshot.currentUnitVariables?.[item.name] : snapshot.userVariableValues[item.name]}
            unitVariables={snapshot.currentUnitVariables ?? undefined}
            texts={snapshot.currentTexts}
          />
        </div>
      }
      practiceWrong={snapshot.practiceWrong?.question === item.name ? snapshot.practiceWrong : null}
      onContinueAfterPractice={() => void manager.continueAfterPractice()}
      frozen={snapshot.currentFrozen}
      onContinueFrozen={() => handleAnswer(snapshot.userVariableValues[item.name] ?? { done: true, skip: true })}
    />
  );

  // A swipe question: the unit (or the question card) is the card to swipe.
  const swipeVariable = item.variable.type === "annotinder" ? item.variable : null;
  // What the question is about, by id: scrolled to when it comes up (docs/client.md §3, "Focus").
  const focus =
    ("focus" in item.variable ? item.variable.focus : undefined) ?? spanVariable?.fields.map((f) => `unit.${f}`);
  const focusDim = "focusDim" in item.variable ? item.variable.focusDim : undefined;
  const withSwipe = (content: ReactNode) =>
    swipeVariable ? (
      <SwipeProvider
        options={swipeVariable.options}
        onAnswer={(option) => handleAnswer(buildValues([{ value: option.value }]))}
      >
        {content}
      </SwipeProvider>
    ) : (
      content
    );

  const questionKey = `var-${item.name}-${snapshot.currentUnit?.id ?? snapshot.navigation.currentUnitIndex ?? "global"}-${positionLabel(snapshot)}`;
  const slideClass = navDirection === "next" ? "animate-slide-in-right" : "animate-slide-in-left";

  return (
    <DisplayContext.Provider value={display}>
      {/* A container: the layout follows the coding area's width, not the window's (a phone-sized preview on a desktop) */}
      <div ref={screen} className="@container flex h-full w-full flex-col overflow-hidden bg-background">
        {correctFlash && (
          <div role="status" className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
            <div className="flex animate-in items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-lg font-semibold text-white shadow-lg zoom-in-90 fade-in">
              <CircleCheck className="h-6 w-6" /> Correct
            </div>
          </div>
        )}
        <CodingTopBar
          snapshot={snapshot}
          manager={manager}
          coderApi={coderApi}
          transferUrl={transferUrl ?? defaultTransferUrl}
          preview={preview}
          onBack={goBack}
          onForward={goForward}
        />
        {snapshot.newUnits && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-border bg-primary/10 px-4 py-1.5 text-sm text-foreground"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>{snapshot.newUnits}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => manager.dismissNewUnits()}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {hasUnitLayout ? (
          <SpanAnnotationProvider
            key={`unit-${snapshot.currentUnit!.id}`}
            fields={spanVariable?.fields ?? []}
            options={spanVariable?.options ?? []}
            defaultSelectionMode={spanVariable?.selectionMode ?? "word"}
            allowGaps={spanVariable?.gaps ?? false}
            initialSpans={spanVariable ? snapshot.currentUnitVariables?.[item.name]?.spans : undefined}
            variableName={item.name}
          >
            <MaybeRelations
              key={`relations-${snapshot.currentUnit!.id}-${item.name}`}
              variable={relationVariable}
              loopVariables={snapshot.currentLoopVariables}
              unitVariables={snapshot.currentUnitVariables ?? undefined}
              initialRelations={relationVariable ? snapshot.currentUnitVariables?.[item.name]?.relations : undefined}
            >
              {/* A size container: the answer pane's max height is a share of this area (cqh). On a tall
              desktop screen it has a max height and is centred, so the answers stay near the unit. */}
              {withSwipe(
                <div className="flex min-h-0 flex-1 flex-col @5xl:p-6">
                  <SwipeSurface className="[container-type:size] relative flex w-full flex-1 flex-col overflow-hidden @5xl:mx-auto @5xl:my-auto @5xl:max-h-[56rem] @5xl:max-w-3xl @5xl:rounded-2xl @5xl:border @5xl:border-border @5xl:bg-card @5xl:shadow-sm">
                    {/* The unit, scrolling. Stable gutter: a scrollbar appearing doesn't move the text. */}
                    <div className="min-h-[100px] flex-1 subtle-scrollbar [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto p-3 sm:p-5">
                      <div
                        key={unitAnimationKey}
                        ref={unitContentRef}
                        className={`relative mx-auto max-w-2xl ${relationVariable ? "pt-12" : ""} ${unitSlideClass}`}
                        onAnimationEnd={() => setUnitSlideClass("")}
                      >
                        {relationVariable && <RelationArrows containerRef={unitContentRef} />}
                        {swipeVariable ? (
                          // The unit moves when swiped; on a card only if the question asks for one (no layout jump otherwise)
                          <SwipeCard
                            key={questionKey}
                            className={
                              swipeVariable.card
                                ? "rounded-2xl border border-border bg-card p-4 shadow-md sm:p-5"
                                : "rounded-2xl bg-background"
                            }
                          >
                            <UnitFields
                              layout={snapshot.currentUnitLayout!}
                              rendered={snapshot.currentUnitTemplate!}
                              focus={focus}
                              focusDim={focusDim}
                            />
                          </SwipeCard>
                        ) : (
                          <UnitFields
                            layout={snapshot.currentUnitLayout!}
                            rendered={snapshot.currentUnitTemplate!}
                            focus={focus}
                            focusDim={focusDim}
                          />
                        )}
                      </div>
                    </div>

                    <DockedAnswerPane>
                      <div key={questionKey} className={slideClass}>
                        {questionElement}
                      </div>
                    </DockedAnswerPane>
                  </SwipeSurface>
                </div>,
              )}
            </MaybeRelations>
          </SpanAnnotationProvider>
        ) : (
          // A question without a unit (coder-level): a card in the middle
          withSwipe(
            <SwipeSurface className="flex flex-1 items-center justify-center overflow-x-hidden overflow-y-auto p-4 sm:p-8">
              <div key={questionKey} className={`mx-auto w-full max-w-xl ${slideClass}`}>
                <SwipeCard className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
                  {questionElement}
                </SwipeCard>
              </div>
            </SwipeSurface>,
          )
        )}
      </div>
    </DisplayContext.Provider>
  );
}

/** The relation question's state around the unit and the answer pane, while one is on screen. */
function MaybeRelations({
  variable,
  children,
  ...props
}: Omit<ComponentProps<typeof RelationAnnotationProvider>, "variable"> & { variable: RelationType | null }) {
  return variable ? (
    <RelationAnnotationProvider variable={variable} {...props}>
      {children}
    </RelationAnnotationProvider>
  ) : (
    <>{children}</>
  );
}
