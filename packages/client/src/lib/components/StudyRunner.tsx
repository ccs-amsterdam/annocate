import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import type { PickNamesResponse, VariableValue } from "@annotinder/contracts";
import { renderSVG } from "uqr";
import { HttpCoderApi, type CoderApi } from "../api/httpCoderApi";
import {
  coderLoginUrl,
  defaultTransferUrl,
  logOut,
  loginAvailable,
  redeemTransfer,
  type CoderSessionScope,
} from "../session/coderSession";
import { useStudyManager } from "../studyManager/useStudyManager";
import type { StudyManagerNavigation } from "../studyManager/StudyManager";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
import { CoderSettingsProvider } from "../context/CoderSettingsContext";
import { useCoderSettings } from "../context/coderSettings";
import { Question } from "./Question";
import { UnitFields } from "./UnitFields";
import { DockedAnswerPane } from "./DockedAnswerPane";
import { TemplateMarkdown } from "./TemplateMarkdown";
import { SessionEnd } from "./SessionEnd";
import { QuitMenu } from "./QuitMenu";
import { CodingNav, CodingProgress } from "./CodingNav";
import { SwipeCard, SwipeProvider, SwipeSurface } from "./SwipeCard";
import { buildValues } from "./answerFields/answerValue";
import { dropRepeatedClick } from "./inputGuards";
import { KeyboardProvider } from "../keyboard/KeyboardProvider";
import { Button } from "@/components/ui/button";
import { LogoSmoke } from "@/components/Logo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertTriangle,
  Loader2,
  Check,
  Settings,
  Sun,
  Moon,
  MonitorSmartphone,
  Copy,
  CloudOff,
  CircleCheck,
} from "lucide-react";

export interface StudyRunnerProps {
  /** Server URL including the deployment, e.g. `/api/d/42` (same origin as the client). */
  baseUrl: string;
  linkSecret?: string;
  /** The page's other query parameters: the coder id and other parameters the link requires, and `url_param` auto variables (stored by the server when the coder starts). */
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

interface ContentProps extends StudyRunnerProps {
  newSession: boolean;
  onStartNewSession: () => void;
  /** On a pick-your-name link: the name picked, and picking (again). */
  coderName?: string;
  onPickName: (name: string) => void;
}

/**
 * Dropdown popover menu for coder-level settings (Dark/Light mode, Shortcut badges).
 */
function CoderSettingsMenu() {
  const { theme, setTheme, showShortcuts, setShowShortcuts } = useCoderSettings();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15"
          title="Coder Settings"
          aria-label="Coder Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-3 p-3 shadow-lg">
        <div className="border-b border-border/80 pb-2">
          <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Settings</h4>
        </div>

        {/* Theme Setting */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Appearance</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                theme === "light"
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-border bg-muted/40 text-foreground hover:bg-muted"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                theme === "dark"
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-border bg-muted/40 text-foreground hover:bg-muted"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* Shortcuts Setting */}
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between">
            <label htmlFor="toggle-shortcuts" className="cursor-pointer text-xs font-medium text-foreground">
              Shortcuts
            </label>
            <button
              id="toggle-shortcuts"
              type="button"
              role="switch"
              aria-checked={showShortcuts}
              onClick={() => setShowShortcuts(!showShortcuts)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                showShortcuts ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  showShortcuts ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Show keyboard hotkey badges on answer options
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Computed scalar position for monotonic forward/backward detection */
function computeGlobalPosition(nav: StudyManagerNavigation): number {
  const phaseIdx = nav.currentPhaseIndex;
  const phase = nav.phases[phaseIdx];
  if (!phase) return 0;
  if (phase.type === "unit_loop") {
    const unitIdx = nav.currentUnitIndex ?? 0;
    const qIdx = phase.questions?.findIndex((q) => q.isCurrent) ?? 0;
    return phaseIdx * 1_000_000 + unitIdx * 100 + (qIdx >= 0 ? qIdx : 0);
  }
  return phaseIdx * 1_000_000;
}

/**
 * Top-level component that boots a coder session against the server and
 * renders the current step, driven by StudyManager (docs/client.md §2).
 *
 * Implements a mobile-first responsive 2-pane layout:
 * - Top pane: scrollable unit content/document
 * - Bottom pane: docked, thumb-friendly question & answer options
 */
function StudyRunnerContent({
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
}: ContentProps) {
  // By content: a new object with the same params must not restart the session.
  const urlParamsKey = JSON.stringify(urlParams ?? {});
  const coderApi = useMemo(
    () => new HttpCoderApi({ baseUrl, linkSecret, urlParams: JSON.parse(urlParamsKey), newSession, coderName }),
    [baseUrl, linkSecret, urlParamsKey, newSession, coderName],
  );
  const { manager, snapshot } = useStudyManager(coderApi);
  const [navDirection, setNavDirection] = useState<"next" | "previous">("next");

  // Track global position to keep navDirection in sync with any navigation change
  const currentPos = useMemo(() => computeGlobalPosition(snapshot.navigation), [snapshot.navigation]);
  const prevPositionRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevPositionRef.current !== null && prevPositionRef.current !== currentPos) {
      if (currentPos < prevPositionRef.current) {
        setNavDirection("previous");
      } else if (currentPos > prevPositionRef.current) {
        setNavDirection("next");
      }
    }
    prevPositionRef.current = currentPos;
  }, [currentPos]);

  // Answers are saved in the background: leaving the page before they are asks first.
  const unsaved = snapshot.unsaved > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // The study's public title names the browser tab
  useEffect(() => {
    if (!snapshot.title) return;
    const before = document.title;
    document.title = snapshot.title;
    return () => {
      document.title = before;
    };
  }, [snapshot.title]);

  // A practice unit answered right: a check, briefly, over the next unit.
  const [rightSeen, setRightSeen] = useState(0);
  const rightFlash = snapshot.practiceRight > rightSeen;
  useEffect(() => {
    if (!rightFlash) return;
    const timer = window.setTimeout(() => setRightSeen(snapshot.practiceRight), 900);
    return () => window.clearTimeout(timer);
  }, [rightFlash, snapshot.practiceRight]);

  const currentUnitId = snapshot.currentUnit?.id ?? snapshot.navigation.currentUnitIndex ?? "none";
  const prevUnitIdRef = useRef<number | string | null>(currentUnitId);
  const [unitAnimationKey, setUnitAnimationKey] = useState<string>(() => `unit-${currentUnitId}`);
  const [unitSlideClass, setUnitSlideClass] = useState<string>("");

  useEffect(() => {
    if (prevUnitIdRef.current !== currentUnitId) {
      prevUnitIdRef.current = currentUnitId;
      setUnitAnimationKey(`unit-${currentUnitId}-${Date.now()}`);
      setUnitSlideClass(navDirection === "next" ? "animate-slide-in-right" : "animate-slide-in-left");
    }
  }, [currentUnitId, navDirection]);

  // Where the coder is ("2"; "4.1": the 1st question of the loop that is the 4th step), for the question's animation key
  const currentPositionLabel = useMemo(() => {
    if (!snapshot.currentItem) return null;
    const currentPhaseIdx = snapshot.navigation.currentPhaseIndex;
    if (currentPhaseIdx < 0 || currentPhaseIdx >= snapshot.navigation.phases.length) {
      return null;
    }
    const currentPhase = snapshot.navigation.phases[currentPhaseIdx];
    const phaseNum = currentPhaseIdx + 1;

    if (currentPhase.type === "unit_loop") {
      const qIdx = currentPhase.questions?.findIndex((q) => q.isCurrent) ?? -1;
      if (qIdx >= 0) {
        return `${phaseNum}.${qIdx + 1}`;
      }
      return `${phaseNum}.1`;
    }
    return `${phaseNum}`;
  }, [snapshot.currentItem, snapshot.navigation]);

  if (snapshot.phase === "loading") {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-8 text-center">
        <LogoSmoke label="Loading session…" />
      </div>
    );
  }

  if (snapshot.phase === "error" && snapshot.errorCode === "coder_has_session") {
    return <CoderElsewhere onStartNewSession={onStartNewSession} />;
  }

  if (snapshot.phase === "error" && (snapshot.errorCode === "name_required" || snapshot.errorCode === "name_taken")) {
    return (
      <PickName
        baseUrl={baseUrl}
        linkSecret={linkSecret}
        taken={snapshot.errorCode === "name_taken" ? coderName : undefined}
        onPick={onPickName}
      />
    );
  }

  if (snapshot.phase === "error" && snapshot.errorCode === "study_paused") {
    return (
      <SessionNotice title="This study is paused">
        <p>
          The researchers paused it for a while. Anything you answered is saved, and you can continue where you left off
          once it goes on.
        </p>
        <p>Please try again later: open your link again, or check now.</p>
        <Button type="button" variant="outline" className="mt-2" onClick={() => manager.retry()}>
          Check again
        </Button>
      </SessionNotice>
    );
  }

  if (snapshot.phase === "error" && snapshot.errorCode === "auth_required") {
    return <LoginNotice />;
  }

  if (snapshot.phase === "error" && snapshot.errorCode === "email_not_allowed") {
    return (
      <SessionNotice title="This email address has no access to this study">
        <p>
          The researchers gave this study to specific email addresses, and the account you are signed in with isn&apos;t
          one of them.
        </p>
        <p>If you were given it with another email address, sign in with that account.</p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => void logOut().then(() => window.location.assign(coderLoginUrl()))}
        >
          Sign in with another account
        </Button>
      </SessionNotice>
    );
  }

  const linkNotice = snapshot.phase === "error" ? LINK_NOTICES[snapshot.errorCode ?? ""] : undefined;
  if (linkNotice) {
    return (
      <SessionNotice title={linkNotice.title}>
        <p>{linkNotice.text}</p>
      </SessionNotice>
    );
  }

  if (
    snapshot.phase === "error" &&
    (snapshot.errorCode === "url_param_missing" || snapshot.errorCode === "url_param_invalid")
  ) {
    return (
      <SessionNotice title="This link is incomplete">
        <p>{snapshot.error}.</p>
        <p>
          Check that you opened the whole link you were given. If you came from a panel or another website, go back and
          follow its link again; if that doesn&apos;t help, contact the researchers.
        </p>
      </SessionNotice>
    );
  }

  if (snapshot.phase === "error") {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center p-6">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-destructive/20 bg-card p-6 text-center shadow-lg">
          <div className="rounded-full bg-destructive/10 p-3 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-lg font-semibold text-foreground">Something went wrong</h3>
          <p className="mt-1 text-sm text-muted-foreground">{snapshot.error}</p>
          <Button type="button" className="mt-5" onClick={() => manager.retry()}>
            Retry
          </Button>
        </div>
      </div>
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
  const isUnitVar = snapshot.phase === "unit_variable";
  const hasUnitLayout = Boolean(
    isUnitVar && snapshot.currentUnit && snapshot.currentUnitLayout && snapshot.currentUnitTemplate,
  );
  const spanVariable = isUnitVar && item.variable.type === "span" ? item.variable : null;

  const handleAnswer = (val: VariableValue) => {
    setNavDirection("next");
    manager.answer(val);
  };

  // The second click of a double click doesn't answer the next question (inputGuards.ts)
  const answerField = (
    <div onClickCapture={dropRepeatedClick} className="contents">
      <Question
        // A fresh answer field per question and unit, starting from that answer
        key={`${snapshot.currentUnit?.id ?? ""}/${item.name}`}
        item={item}
        onAnswer={handleAnswer}
        initialValue={!isUnitVar ? snapshot.userVariableValues[item.name] : snapshot.currentUnitVariables?.[item.name]}
        unitVariables={snapshot.currentUnitVariables ?? undefined}
        texts={snapshot.currentTexts}
      />
    </div>
  );
  // A practice question answered wrongly: the feedback with the question (docs/architecture.md §6.2)
  const practiceWrong = snapshot.practiceWrong?.question === item.name ? snapshot.practiceWrong : null;
  const practiceNote = practiceWrong && (
    <div role="alert" className="mx-4 mb-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
      <p className="font-semibold">Not quite</p>
      {practiceWrong.messages.map((m, i) => (
        <TemplateMarkdown key={i} rendered={m} />
      ))}
      {practiceWrong.retry ? (
        <p className="mt-1 text-muted-foreground">This is a practice unit: answer again.</p>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => void manager.continueAfterPractice()}
        >
          Continue
        </Button>
      )}
    </div>
  );
  // A frozen answer (units were coded with it): shown, not changeable.
  const questionElement = practiceNote ? (
    <div className="flex flex-col">
      {practiceNote}
      {answerField}
    </div>
  ) : snapshot.currentFrozen ? (
    <div className="flex flex-col gap-3">
      <fieldset disabled className="pointer-events-none opacity-60" aria-readonly>
        {answerField}
      </fieldset>
      <p className="px-4 text-sm text-muted-foreground">
        You coded units with this answer, so it can&apos;t be changed any more.
      </p>
      <Button
        className="mx-4 w-fit"
        onClick={() => handleAnswer(snapshot.userVariableValues[item.name] ?? { done: true, skip: true })}
      >
        Continue
      </Button>
    </div>
  ) : (
    answerField
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

  const variableKey = `var-${item.name}-${snapshot.currentUnit?.id ?? snapshot.navigation.currentUnitIndex ?? "global"}-${currentPositionLabel}`;
  const slideClass = navDirection === "next" ? "animate-slide-in-right" : "animate-slide-in-left";

  return (
    // A container: the layout follows the coding area's width, not the window's (a phone-sized preview on a desktop)
    <div className="@container flex h-full w-full flex-col overflow-hidden bg-background">
      {rightFlash && (
        <div role="status" className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="flex animate-in items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-lg font-semibold text-white shadow-lg zoom-in-90 fade-in">
            <CircleCheck className="h-6 w-6" /> Correct
          </div>
        </div>
      )}
      {/* Top Header / Progress Bar */}
      <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-bar-foreground/10 bg-bar px-3 text-bar-foreground shadow-sm sm:px-4">
        <CodingProgress navigation={snapshot.navigation} />
        <CodingNav
          navigation={snapshot.navigation}
          title={snapshot.title}
          onJumpToPhase={(index) => void manager.jumpToPhase(index)}
          onJumpToUnit={(index) => void manager.jumpToUnit(index)}
          onJumpToQuestion={(index) => void manager.jumpToLoopStep(index)}
          onBack={() => {
            setNavDirection("previous");
            void manager.goBack();
          }}
          onForward={() => {
            setNavDirection("next");
            void manager.goForward();
          }}
        />

        {/* Right Section: Coder Settings Menu */}
        <div className="flex shrink-0 items-center gap-1">
          {snapshot.retrying && (
            <span
              className="flex items-center gap-1 text-xs"
              role="status"
              title="Your answers are kept and saved as soon as the connection is back."
            >
              <CloudOff className="h-4 w-4" />
              <span className="hidden sm:inline">Not saved yet: no connection</span>
            </span>
          )}
          {!preview && (
            <TransferMenu
              coderApi={coderApi}
              transferUrl={transferUrl ?? defaultTransferUrl}
              login={snapshot.login}
              canLogIn={snapshot.canLogIn}
            />
          )}
          <CoderSettingsMenu />
          <QuitMenu
            onQuit={(requestDeletion) => manager.quit(requestDeletion)}
            canTransfer={!preview && !!coderApi.createTransfer}
            login={snapshot.login}
          />
        </div>
      </header>

      {/* Main Content Area: Responsive Split View */}
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
          {/* A size container: the answer pane's max height is a share of this area (cqh). On a tall
              desktop screen it has a max height and is centred, so the answers stay near the unit. */}
          {withSwipe(
            <div className="flex min-h-0 flex-1 flex-col @5xl:p-6">
              <SwipeSurface className="[container-type:size] relative flex w-full flex-1 flex-col overflow-hidden @5xl:mx-auto @5xl:my-auto @5xl:max-h-[56rem] @5xl:max-w-3xl @5xl:rounded-2xl @5xl:border @5xl:border-border @5xl:bg-card @5xl:shadow-sm">
                {/* Scrollable Unit Content (Document). Stable gutter: a scrollbar appearing doesn't move the text. */}
                <div className="min-h-[100px] flex-1 subtle-scrollbar [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto p-3 sm:p-5">
                  <div
                    key={unitAnimationKey}
                    className={`mx-auto max-w-2xl ${unitSlideClass}`}
                    onAnimationEnd={() => setUnitSlideClass("")}
                  >
                    {swipeVariable ? (
                      // The unit moves when swiped; on a card only if the question asks for one (no layout jump otherwise)
                      <SwipeCard
                        key={variableKey}
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

                {/* Compact, Thumb-Friendly Docked Bottom Answer Form */}
                <DockedAnswerPane>
                  <div key={variableKey} className={slideClass}>
                    {questionElement}
                  </div>
                </DockedAnswerPane>
              </SwipeSurface>
            </div>,
          )}
        </SpanAnnotationProvider>
      ) : (
        /* Standalone Question (intro, survey, user variable without document) */
        withSwipe(
          <SwipeSurface className="flex flex-1 items-center justify-center overflow-x-hidden overflow-y-auto p-4 sm:p-8">
            <div key={variableKey} className={`mx-auto w-full max-w-xl ${slideClass}`}>
              <SwipeCard className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
                {questionElement}
              </SwipeCard>
            </div>
          </SwipeSurface>,
        )
      )}
    </div>
  );
}

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
  if (!session.ready) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-8 text-center">
        <LogoSmoke label="Loading session…" />
      </div>
    );
  }

  // The server moves this device to a new session on the first request.
  const startNewSession = () => setSession((s) => ({ ...s, generation: s.generation + 1, newSession: true }));

  return (
    <StudyRunnerContent
      key={session.generation}
      {...props}
      newSession={session.newSession}
      onStartNewSession={startNewSession}
      coderName={session.coderName}
      onPickName={(coderName) => setSession((s) => ({ ...s, generation: s.generation + 1, coderName }))}
    />
  );
}

/** What a coder sees when their link can't start a session (the server's error codes). */
const LINK_NOTICES: Partial<Record<string, { title: string; text: string }>> = {
  link_not_found: {
    title: "This link doesn't work",
    text: "Check that you opened the whole link you were given. If it still doesn't work, contact the researchers.",
  },
  link_revoked: {
    title: "This link has been withdrawn",
    text: "The researchers no longer accept new coders through this link. If you were sent a new link, use that one.",
  },
  link_used_up: {
    title: "This link is full",
    text: "As many people as the researchers planned have already started through this link. Thank you for your interest.",
  },
  link_inactive: {
    title: "This link is no longer active",
    text: "The researchers no longer use this link for new coders. If you were sent a new link, use that one.",
  },
};

function SessionNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center p-6">
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-lg">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <MonitorSmartphone className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** A link that needs a login (docs/coder-identity.md §5). */
function LoginNotice() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void loginAvailable().then(setAvailable);
  }, []);
  return (
    <SessionNotice title="This study asks you to sign in">
      <p>
        Sign in before you start. Your answers are then kept with your account: sign in again to continue later, on any
        device. If the researchers gave you this study by email address, use that address.
      </p>
      {available === false ? (
        <p>This server doesn&apos;t offer a sign-in, though. Please contact the researchers.</p>
      ) : (
        <Button
          type="button"
          className="mt-2"
          disabled={available === null}
          onClick={() => window.location.assign(coderLoginUrl())}
        >
          Sign in
        </Button>
      )}
    </SessionNotice>
  );
}

/**
 * "Continue on another device": a one-time link + QR code for this session.
 * A coder whose session is linked to their email can also log in on the
 * other device. Where the link offers a login, it is offered here too.
 */
function TransferMenu({
  coderApi,
  transferUrl,
  login,
  canLogIn,
}: {
  coderApi: CoderApi;
  transferUrl: (token: string) => string;
  login: string | null;
  canLogIn: boolean;
}) {
  const [link, setLink] = useState<{ url: string; expiresAt: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function open(isOpen: boolean) {
    if (!isOpen || !coderApi.createTransfer) return;
    setError(null);
    setCopied(false);
    try {
      const transfer = await coderApi.createTransfer();
      setLink({ url: transferUrl(transfer.token), expiresAt: new Date(transfer.expiresAt) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Popover onOpenChange={open}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15"
          title="Continue on another device"
          aria-label="Continue on another device"
        >
          <MonitorSmartphone className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3 shadow-lg">
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Continue on another device
        </h4>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && !link && <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />}
        {link && (
          <>
            <div
              className="mx-auto w-44 rounded bg-white p-1"
              // uqr renders an SVG of rects from the URL; no user markup is involved.
              dangerouslySetInnerHTML={{ __html: renderSVG(link.url) }}
            />
            <div className="flex items-center gap-1">
              <input
                readOnly
                value={link.url}
                className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                title="Copy link"
                onClick={() => {
                  void navigator.clipboard?.writeText(link.url).then(() => setCopied(true));
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scan or open this on your other device. It works once, until{" "}
              {link.expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Anyone with the link can
              continue your session, so don&apos;t share it.
            </p>
          </>
        )}
        {login && (
          <p className="border-t pt-2.5 text-[11px] text-muted-foreground">
            Or open this study&apos;s link on the other device and log in there as <strong>{login}</strong>.
          </p>
        )}
        {canLogIn && (
          <div className="space-y-1.5 border-t pt-2.5">
            <p className="text-[11px] text-muted-foreground">
              Or log in: your answers are then kept with your account, and you can continue on any device by logging in.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => window.location.assign(coderLoginUrl())}
            >
              Log in
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A link where coders pick their name (docs/coder-identity.md): the coders'
 * names, those another device picked (where a name stays on the first
 * device) shown as taken.
 */
function PickName({
  baseUrl,
  linkSecret,
  taken,
  onPick,
}: {
  baseUrl: string;
  linkSecret?: string;
  /** The name just picked, which turned out to be taken. */
  taken?: string;
  onPick: (name: string) => void;
}) {
  const [names, setNames] = useState<PickNamesResponse["names"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    HttpCoderApi.getNames({ baseUrl, linkSecret })
      .then((r) => !cancelled && setNames(r.names))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [baseUrl, linkSecret]);
  return (
    <SessionNotice title="Who are you?">
      <p>Pick your name to start. You continue with it on this device.</p>
      {taken && <p className="text-destructive">{taken} was already picked on another device: pick your own name.</p>}
      {error && <p className="text-destructive">{error}</p>}
      {names === null && !error && <LogoSmoke label="Loading names…" />}
      {names && names.length === 0 && <p>There are no names to pick yet: ask the researchers.</p>}
      {names && names.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {names.map(({ name, taken: isTaken }) => (
            <Button
              key={name}
              type="button"
              variant="outline"
              disabled={isTaken}
              title={isTaken ? "Picked on another device" : undefined}
              onClick={() => onPick(name)}
            >
              {name}
              {isTaken && <span className="ml-1 text-xs text-muted-foreground">(taken)</span>}
            </Button>
          ))}
        </div>
      )}
    </SessionNotice>
  );
}

/**
 * A coder id that already has a session on another device or browser
 * (docs/coder-identity.md §4). Normally the coder continues there; a new
 * session is only for a coder who can't get back to the earlier one (a lost
 * device, cleared browser data), after confirming that.
 */
function CoderElsewhere({ onStartNewSession }: { onStartNewSession: () => void }) {
  const [cantReturn, setCantReturn] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <SessionNotice title="You already started on another device">
      <p>
        This link was already used to start on another device or browser. Your answers so far are there, and that is
        where you continue.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Open this link again on the device and browser where you started.</li>
        <li>
          To continue <em>here</em>: on that device, open &quot;Continue on another device&quot; (top right) and open
          the link or scan the code it shows here. If the study lets you log in, you can also log in there, and then log
          in here.
        </li>
      </ul>
      {!cantReturn ? (
        <Button type="button" variant="ghost" className="mt-2 self-start" onClick={() => setCantReturn(true)}>
          I can&apos;t get back to my earlier session…
        </Button>
      ) : (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-3">
          <p>
            Starting again should rarely be needed: only when you can&apos;t (easily) use the device or browser where
            you started, for instance because you lost it or its browser data was cleared. A new session starts from the
            beginning, without your earlier answers, and the researchers see that this link started twice.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I can&apos;t get back to the device or browser where I started.</span>
          </label>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={!confirmed}
            onClick={onStartNewSession}
          >
            Start a new session
          </Button>
        </div>
      )}
    </SessionNotice>
  );
}
