import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import type { VariableValue } from "@annotinder/contracts";
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
import { useJobManager } from "../jobManager/useJobManager";
import type { JobManagerNavigation } from "../jobManager/JobManager";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
import { CoderSettingsProvider, useCoderSettings } from "../context/CoderSettingsContext";
import { Question } from "./Question";
import { UnitFields } from "./UnitFields";
import { DockedAnswerPane } from "./DockedAnswerPane";
import { SessionEnd } from "./SessionEnd";
import { QuitMenu } from "./QuitMenu";
import { SwipeCard, SwipeProvider } from "./SwipeCard";
import { buildValues } from "./answerFields/answerValue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertTriangle,
  Loader2,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Check,
  Layers,
  Settings,
  Sun,
  Moon,
  MonitorSmartphone,
  Copy,
  CloudOff,
} from "lucide-react";

export interface JobRunnerProps {
  /** Server URL including the deployment, e.g. `/d/42` (same origin as the client). */
  baseUrl: string;
  inviteSecret?: string;
  /** The page's other query parameters: the participant id and other parameters the invite requires, and `url_param` auto variables (stored by the server when the coder starts). */
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
}

interface ContentProps extends JobRunnerProps {
  newSession: boolean;
  onStartNewSession: () => void;
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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground hover:bg-primary-foreground/15 transition-colors cursor-pointer"
          title="Coder Settings"
          aria-label="Coder Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-3 shadow-lg space-y-3">
        <div className="border-b border-border/80 pb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</h4>
        </div>

        {/* Theme Setting */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Appearance</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                theme === "light"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-muted/40 text-foreground border-border hover:bg-muted"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                theme === "dark"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-muted/40 text-foreground border-border hover:bg-muted"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* Shortcuts Setting */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <label htmlFor="toggle-shortcuts" className="text-xs font-medium text-foreground cursor-pointer">
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
          <p className="text-[11px] text-muted-foreground leading-tight">
            Show keyboard hotkey badges on answer options
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Computed scalar position for monotonic forward/backward detection */
function computeGlobalPosition(nav: JobManagerNavigation): number {
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
 * renders the current step, driven by JobManager (docs/client.md §2).
 *
 * Implements a mobile-first responsive 2-pane layout:
 * - Top pane: scrollable unit content/document
 * - Bottom pane: docked, thumb-friendly question & answer options
 */
function JobRunnerContent({
  baseUrl,
  inviteSecret,
  urlParams,
  newSession,
  onStartNewSession,
  transferUrl,
  preview,
  onFinished,
}: ContentProps) {
  // By content: a new object with the same params must not restart the session.
  const urlParamsKey = JSON.stringify(urlParams ?? {});
  const coderApi = useMemo(
    () => new HttpCoderApi({ baseUrl, inviteSecret, urlParams: JSON.parse(urlParamsKey), newSession }),
    [baseUrl, inviteSecret, urlParamsKey, newSession],
  );
  const { manager, snapshot } = useJobManager(coderApi);
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Global position counter label (e.g., "1", "2" for coder variables; "4.1", "4.2" for unit variables)
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
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  if (snapshot.phase === "error" && snapshot.errorCode === "participant_has_session") {
    return (
      <SessionNotice title="This link was already used on another device">
        <p>Someone started with this link on another device or browser.</p>
        <p>
          <strong>If that was you</strong>, your answers are on that device. Continue there by opening this link on it. To
          continue <em>here</em> instead, open &quot;Continue on another device&quot; (top right) on that device and scan or
          open the link it shows.
        </p>
        <p>
          <strong>If you can&apos;t, or it wasn&apos;t you</strong>, start a new session here. It won&apos;t include the earlier
          answers.
        </p>
        <Button type="button" variant="outline" className="mt-2" onClick={onStartNewSession}>
          Start a new session
        </Button>
      </SessionNotice>
    );
  }

  if (snapshot.phase === "error" && snapshot.errorCode === "auth_required") {
    return <LoginNotice />;
  }

  if (snapshot.phase === "error" && snapshot.errorCode === "email_not_invited") {
    return (
      <SessionNotice title="This invitation is for other people">
        <p>The researchers invited specific email addresses, and the account you are logged in with isn&apos;t one of them.</p>
        <p>If you were invited with another email address, log in with that account.</p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => void logOut().then(() => window.location.assign(coderLoginUrl()))}
        >
          Log in with another account
        </Button>
      </SessionNotice>
    );
  }

  if (snapshot.phase === "error" && (snapshot.errorCode === "url_param_missing" || snapshot.errorCode === "url_param_invalid")) {
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
          <Button
            type="button"
            className="mt-5"
            onClick={() => manager.retry()}
          >
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
  const hasUnitLayout = Boolean(isUnitVar && snapshot.currentUnit && snapshot.currentUnitLayout && snapshot.currentUnitTemplate);
  const spanVariable = isUnitVar && item.variable.type === "span" ? item.variable : null;

  const handleAnswer = (val: VariableValue) => {
    setNavDirection("next");
    manager.answer(val);
  };

  const answerField = (
    <Question
      // A fresh answer field per question and unit, starting from that answer
      key={`${snapshot.currentUnit?.id ?? ""}/${item.name}`}
      item={item}
      onAnswer={handleAnswer}
      initialValue={
        !isUnitVar
          ? snapshot.userVariableValues[item.name]
          : snapshot.currentUnitVariables?.[item.name]
      }
      unitVariables={snapshot.currentUnitVariables ?? undefined}
      texts={snapshot.currentTexts}
    />
  );
  // A frozen answer (units were coded with it): shown, not changeable.
  const questionElement = snapshot.currentFrozen ? (
    <div className="flex flex-col gap-3">
      <fieldset disabled className="pointer-events-none opacity-60" aria-readonly>
        {answerField}
      </fieldset>
      <p className="px-4 text-sm text-muted-foreground">You coded units with this answer, so it can&apos;t be changed any more.</p>
      <Button className="mx-4 w-fit" onClick={() => handleAnswer(snapshot.userVariableValues[item.name] ?? { done: true, skip: true })}>
        Continue
      </Button>
    </div>
  ) : (
    answerField
  );

  // A swipe question: the unit (or the question card) is the card to swipe.
  const swipeVariable = item.variable.type === "annotinder" ? item.variable : null;
  // What the question is about, by id: scrolled to when it comes up (docs/client.md §3, "Focus").
  const focus = ("focus" in item.variable ? item.variable.focus : undefined) ?? spanVariable?.fields.map((f) => `unit.${f}`);
  const focusDim = "focusDim" in item.variable ? item.variable.focusDim : undefined;
  const withSwipe = (content: ReactNode) =>
    swipeVariable ? (
      <SwipeProvider options={swipeVariable.options} onAnswer={(option) => handleAnswer(buildValues([{ value: option.value }]))}>
        {content}
      </SwipeProvider>
    ) : (
      content
    );

  const variableKey = `var-${item.name}-${snapshot.currentUnit?.id ?? snapshot.navigation.currentUnitIndex ?? "global"}-${currentPositionLabel}`;
  const slideClass = navDirection === "next" ? "animate-slide-in-right" : "animate-slide-in-left";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top Header / Progress Bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-primary/20 bg-primary px-3 sm:px-4 text-primary-foreground shadow-sm">
        {/* Left Section: Menu Popover, Global Position Counter, Back/Forward Chevrons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Overview Dropdown Menu */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground hover:bg-primary-foreground/15 transition-colors cursor-pointer"
                title="Overview & Navigation"
                aria-label="Overview & Navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0 shadow-lg">
              <div className="flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60 text-xs font-semibold text-muted-foreground bg-muted/30">
                  <span className="uppercase tracking-wider">Navigation</span>
                  <span className="font-mono text-[11px]">
                    {snapshot.navigation.phases.filter((p) => p.isCompleted).length} /{" "}
                    {snapshot.navigation.phases.length}
                  </span>
                </div>

                {/* List of Navigation Phases */}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {snapshot.navigation.phases.map((phase, pIdx) => {
                    const phaseNumber = pIdx + 1;

                    if (phase.type === "unit_loop") {
                      const currentNum = (phase.currentUnitIndex ?? snapshot.navigation.currentUnitIndex ?? 0) + 1;
                      const totalNum = Math.max(1, phase.totalUnits ?? phase.unitCount ?? snapshot.navigation.totalUnitsInHistory);

                      return (
                        <div key={phase.name} className="flex flex-col gap-0.5">
                          {/* Unit Loop Header Row: Not highlighted when inside a unit variable, with direct unit scroll/select dropdown */}
                          <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground bg-muted/20">
                            <button
                              type="button"
                              onClick={() => {
                                manager.jumpToPhase(phase.index);
                                setMenuOpen(false);
                              }}
                              className="flex items-center gap-2 truncate cursor-pointer text-left flex-1 min-w-0"
                              title={phase.label}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {phase.isCompleted ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <Layers className="h-3.5 w-3.5 text-primary" />
                                )}
                              </span>
                              <span className="truncate font-medium text-foreground">{phase.label}</span>
                            </button>

                            {/* Dropdown to scroll and pick unit index directly */}
                            <div className="relative flex items-center shrink-0 ml-2">
                              <select
                                value={currentNum}
                                onChange={(e) => {
                                  const u = parseInt(e.target.value, 10);
                                  if (!isNaN(u)) {
                                    manager.jumpToUnit(u - 1);
                                  }
                                }}
                                className="h-6 rounded border border-border bg-background px-1.5 pr-5 text-[11px] font-mono cursor-pointer appearance-none text-foreground hover:bg-muted/50 focus:outline-none"
                                title="Select unit"
                              >
                                {Array.from({ length: totalNum }, (_, i) => (
                                  <option key={i + 1} value={i + 1}>
                                    Unit {i + 1} / {totalNum}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-1 h-3 w-3 text-muted-foreground" />
                            </div>
                          </div>

                          {/* Unit Questions (Indented child list with 4.1, 4.2 style numbers) */}
                          {phase.questions && phase.questions.length > 0 && (
                            <div className="ml-3 space-y-0.5 border-l border-border/60 pl-2">
                              {phase.questions.map((q, qIdx) => {
                                const questionNumber = `${phaseNumber}.${qIdx + 1}`;

                                return (
                                  <button
                                    key={q.name}
                                    type="button"
                                    onClick={() => {
                                      manager.jumpToPhase(phase.index);
                                      setMenuOpen(false);
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors cursor-pointer text-left ${
                                      q.isCurrent
                                        ? "bg-primary/10 font-semibold text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                    }`}
                                    title={q.label}
                                  >
                                    <span className="font-mono text-[10px] min-w-[1.75rem] text-muted-foreground shrink-0">
                                      {questionNumber}
                                    </span>
                                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                                      {q.isCompleted ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                      ) : q.isCurrent ? (
                                        <CircleDot className="h-3.5 w-3.5 text-primary" />
                                      ) : (
                                        <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                                      )}
                                    </span>
                                    <span className="truncate">{q.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Coder / User Variable (Numbered 1, 2, etc.)
                    return (
                      <button
                        key={phase.name}
                        type="button"
                        onClick={() => {
                          manager.jumpToPhase(phase.index);
                          setMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer text-left ${
                          phase.isCurrent
                            ? "bg-primary/10 font-semibold text-primary"
                            : "text-foreground hover:bg-muted/60"
                        }`}
                        title={phase.label}
                      >
                        <span className="font-mono text-[10px] min-w-[1.25rem] text-muted-foreground shrink-0">
                          {phaseNumber}
                        </span>
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {phase.isCompleted ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : phase.isCurrent ? (
                            <CircleDot className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                          )}
                        </span>
                        <span className="truncate">{phase.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Global position counter with minimum width so adjacent chevrons don't jump around */}
          {currentPositionLabel && (
            <span
              className="inline-flex items-center justify-center min-w-[3.25rem] h-7 px-2 rounded-md bg-primary-foreground/15 font-mono text-xs font-semibold text-primary-foreground select-none"
              title={`Question ${currentPositionLabel}`}
            >
              {currentPositionLabel}
            </span>
          )}

          {/* Chevrons right next to the counter */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/15 disabled:opacity-30 cursor-pointer"
              disabled={!snapshot.navigation.canGoBack}
              onClick={() => {
                setNavDirection("previous");
                manager.goBack();
              }}
              title="Go back"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/15 disabled:opacity-30 cursor-pointer"
              disabled={!snapshot.navigation.canGoForward}
              onClick={() => {
                setNavDirection("next");
                manager.goForward();
              }}
              title="Go forward"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Right Section: Coder Settings Menu */}
        <div className="flex items-center gap-1 shrink-0">
          {snapshot.retrying && (
            <span className="flex items-center gap-1 text-xs" role="status" title="Your answers are kept and saved as soon as the connection is back.">
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
          {/* A size container: the answer pane's max height is a share of this area (cqh) */}
          {withSwipe(
            <div className="flex flex-1 flex-col overflow-hidden relative [container-type:size]">
              {/* Scrollable Unit Content (Document). Stable gutter: a scrollbar appearing doesn't move the text. */}
              <div className="subtle-scrollbar flex-1 min-h-[100px] overflow-y-auto overflow-x-hidden p-3 sm:p-5 [scrollbar-gutter:stable]">
                <div
                  key={unitAnimationKey}
                  className={`mx-auto max-w-2xl ${unitSlideClass}`}
                  onAnimationEnd={() => setUnitSlideClass("")}
                >
                  {swipeVariable ? (
                    <SwipeCard key={variableKey} className="rounded-2xl border border-border bg-card p-4 shadow-md sm:p-5">
                      <UnitFields layout={snapshot.currentUnitLayout!} rendered={snapshot.currentUnitTemplate!} focus={focus} focusDim={focusDim} />
                    </SwipeCard>
                  ) : (
                    <UnitFields layout={snapshot.currentUnitLayout!} rendered={snapshot.currentUnitTemplate!} focus={focus} focusDim={focusDim} />
                  )}
                </div>
              </div>

              {/* Compact, Thumb-Friendly Docked Bottom Answer Form */}
              <DockedAnswerPane>
                <div key={variableKey} className={slideClass}>
                  {questionElement}
                </div>
              </DockedAnswerPane>
            </div>,
          )}
        </SpanAnnotationProvider>
      ) : (
        /* Standalone Question (intro, survey, user variable without document) */
        <div className="flex flex-1 items-center justify-center overflow-y-auto overflow-x-hidden p-4 sm:p-8">
          <div key={variableKey} className={`mx-auto w-full max-w-xl ${slideClass}`}>
            {withSwipe(
              <SwipeCard className="rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-sm">{questionElement}</SwipeCard>,
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function JobRunner(props: JobRunnerProps) {
  return (
    <CoderSettingsProvider>
      <CoderSessionGate {...props} />
    </CoderSettingsProvider>
  );
}

/**
 * Gets the session ready before coding starts: redeems a transfer link (the
 * server then sets this device's session cookie), and starts a new
 * session on request. The session itself is an httpOnly cookie, created by
 * the server on first visit. See docs/coder-identity.md §4.
 */
function CoderSessionGate(props: JobRunnerProps) {
  const { baseUrl, inviteSecret, transferToken, onTransferRedeemed, newSession = false } = props;
  const scope = useMemo<CoderSessionScope>(
    () => ({ baseUrl, inviteSecret }),
    [baseUrl, inviteSecret],
  );
  const [session, setSession] = useState<{ ready: boolean; generation: number; newSession: boolean; error: string | null }>(
    () => ({ ready: !transferToken, generation: 0, newSession, error: null }),
  );

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
        <p>Links to continue on another device work once and expire after 15 minutes. Make a new one on the device you started on.</p>
      </SessionNotice>
    );
  }
  if (!session.ready) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  // The server replaces this device's cookie on the first request.
  const startNewSession = () => setSession((s) => ({ ...s, generation: s.generation + 1, newSession: true }));

  return (
    <JobRunnerContent
      key={session.generation}
      {...props}
      newSession={session.newSession}
      onStartNewSession={startNewSession}
    />
  );
}

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

/** An invitation that needs a login (docs/coder-identity.md §5). */
function LoginNotice() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void loginAvailable().then(setAvailable);
  }, []);
  return (
    <SessionNotice title="Log in to take part">
      <p>
        This invitation asks you to log in first. Your answers are then kept with your account: log in again to continue
        later, on any device.
      </p>
      {available === false ? (
        <p>This server doesn&apos;t offer a login, though. Please contact the researchers.</p>
      ) : (
        <Button type="button" className="mt-2" disabled={available === null} onClick={() => window.location.assign(coderLoginUrl())}>
          Log in
        </Button>
      )}
    </SessionNotice>
  );
}

/**
 * "Continue on another device": a one-time link + QR code for this session.
 * A coder whose session is linked to their email can also log in on the
 * other device. Where the invitation offers a login, it is offered here too.
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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground hover:bg-primary-foreground/15 transition-colors cursor-pointer"
          title="Continue on another device"
          aria-label="Continue on another device"
        >
          <MonitorSmartphone className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3 shadow-lg">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Continue on another device</h4>
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
              <input readOnly value={link.url} className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs" />
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
            Or open this job&apos;s link on the other device and log in there as <strong>{login}</strong>.
          </p>
        )}
        {canLogIn && (
          <div className="space-y-1.5 border-t pt-2.5">
            <p className="text-[11px] text-muted-foreground">
              Or log in: your answers are then kept with your account, and you can continue on any device by logging in.
            </p>
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => window.location.assign(coderLoginUrl())}>
              Log in
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
