import { useState, useMemo, useEffect, useRef } from "react";
import { HttpJobServer } from "../api/httpJobServer";
import { useJobManager } from "../jobManager/useJobManager";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
import { CoderSettingsProvider, useCoderSettings } from "../context/CoderSettingsContext";
import { Question } from "./Question";
import { UnitFields } from "./UnitFields";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CheckCircle2,
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
} from "lucide-react";

export interface JobRunnerProps {
  baseUrl: string;
  coderKey: string;
  inviteSecret?: string;
  onFinished?: () => void;
  preview?: boolean;
}

/**
 * Docked bottom question container that maintains a stable, controlled height
 * so that question transitions never shift the unit document above.
 * Includes a top draggable handle to let coders resize the panel to their device preference.
 */
function DockedAnswerPane({ children }: { children: React.ReactNode }) {
  const [height, setHeight] = useState<number>(() => {
    if (typeof window === "undefined") return 220;
    const saved = localStorage.getItem("annocate_docked_pane_height");
    const num = saved ? parseInt(saved, 10) : NaN;
    return !isNaN(num) && num >= 130 && num <= 700 ? num : 220;
  });

  const isDraggingRef = useRef(false);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current) return;
      const newH = Math.max(130, Math.min(window.innerHeight * 0.75, window.innerHeight - e.clientY));
      setHeight(newH);
    }
    function onTouchMove(e: TouchEvent) {
      if (!isDraggingRef.current || e.touches.length === 0) return;
      const touch = e.touches[0];
      const newH = Math.max(130, Math.min(window.innerHeight * 0.75, window.innerHeight - touch.clientY));
      setHeight(newH);
    }
    function onEnd() {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.userSelect = "";
        localStorage.setItem("annocate_docked_pane_height", String(Math.round(height)));
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [height]);

  function startDragging(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.userSelect = "none";
  }

  return (
    <div
      style={{ height: `${height}px` }}
      className="z-10 flex flex-col min-h-0 shrink-0 border-t border-border bg-card/95 shadow-lg backdrop-blur transition-colors duration-150 relative"
    >
      {/* Draggable resize handle at top border: taller touch target (h-5 sm:h-6) for easy selecting */}
      <div
        onMouseDown={startDragging}
        onTouchStart={startDragging}
        className="group flex h-5 sm:h-6 w-full cursor-row-resize items-center justify-center hover:bg-primary/15 active:bg-primary/25 transition-colors shrink-0 select-none"
        title="Drag to resize answer panel"
        role="separator"
        aria-orientation="horizontal"
      >
        <div className="h-1.5 w-12 sm:w-14 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
      </div>

      {/* Content div with reduced top padding to maintain balanced aesthetics with the taller drag bar */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-2.5 pt-0.5 sm:px-6 sm:pb-3.5 sm:pt-1">
        <div className="mx-auto w-full max-w-xl">
          {children}
        </div>
      </div>
    </div>
  );
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

/**
 * Top-level component that boots a coder session against a job server and
 * renders the current step (design plan §5's JobManager, Phase 3.4's
 * end-to-end flow).
 *
 * Implements a mobile-first responsive 2-pane layout:
 * - Top pane: scrollable unit content/document
 * - Bottom pane: docked, thumb-friendly question & answer options
 */
function JobRunnerContent({ baseUrl, coderKey, inviteSecret, onFinished }: JobRunnerProps) {
  const jobServer = useMemo(
    () => new HttpJobServer({ baseUrl, coderKey, inviteSecret }),
    [baseUrl, coderKey, inviteSecret],
  );
  const { manager, snapshot } = useJobManager(jobServer);
  const [menuOpen, setMenuOpen] = useState(false);

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
      <div className="flex h-full min-h-[300px] items-center justify-center p-6">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
          <div className="rounded-full bg-primary/10 p-4 text-primary">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">Job Complete!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;ve completed all available units. Thank you for your contributions!
          </p>
          {onFinished && (
            <Button onClick={onFinished} className="mt-6">
              Done
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!snapshot.currentItem || (snapshot.currentItem.type !== "user_variable" && snapshot.currentItem.type !== "unit_variable")) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Unexpected session state.</p>
      </div>
    );
  }

  const item = snapshot.currentItem;
  const isUnitVar = item.type === "unit_variable";
  const hasUnitLayout = Boolean(isUnitVar && snapshot.currentUnit && snapshot.currentUnitLayout);
  const spanVariable = isUnitVar && item.variable.type === "span" ? item.variable : null;

  const questionElement = (
    <Question
      item={item}
      onAnswer={(val) => manager.answer(val)}
      initialValue={
        item.type === "user_variable"
          ? snapshot.userVariableValues[item.name]
          : snapshot.currentUnitVariables?.[item.name]
      }
      unitVariables={snapshot.currentUnitVariables ?? undefined}
    />
  );

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
                      const totalNum = Math.max(1, phase.unitCount ?? snapshot.navigation.totalUnitsInHistory);

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
                                      if (phase.isCurrent) {
                                        manager.jumpToLoopStep(q.index);
                                      } else {
                                        manager.jumpToUnitQuestion(phase.index, q.index);
                                      }
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
              onClick={() => manager.goBack()}
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
              onClick={() => manager.goForward()}
              title="Go forward"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Right Section: Coder Settings Menu */}
        <div className="flex items-center gap-1 shrink-0">
          <CoderSettingsMenu />
        </div>
      </header>

      {/* Main Content Area: Responsive Split View */}
      {hasUnitLayout ? (
        spanVariable ? (
          <SpanAnnotationProvider
            key={`${item.name}-${snapshot.currentUnit!.id}`}
            column={spanVariable.column}
            codes={spanVariable.codes}
            defaultSelectionMode={spanVariable.selectionMode ?? "word"}
            initialSpans={snapshot.currentUnitVariables?.[item.name]?.spans}
          >
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Scrollable Unit Content (Document) */}
              <div className="flex-1 min-h-[100px] overflow-y-auto p-3 sm:p-5">
                <div className="mx-auto max-w-2xl">
                  <UnitFields layout={snapshot.currentUnitLayout!} data={snapshot.currentUnit!.data} />
                </div>
              </div>

              {/* Compact, Thumb-Friendly Docked Bottom Answer Form */}
              <DockedAnswerPane>
                {questionElement}
              </DockedAnswerPane>
            </div>
          </SpanAnnotationProvider>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Scrollable Unit Content (Document) */}
            <div className="flex-1 min-h-[100px] overflow-y-auto p-3 sm:p-5">
              <div className="mx-auto max-w-2xl">
                <UnitFields layout={snapshot.currentUnitLayout!} data={snapshot.currentUnit!.data} />
              </div>
            </div>

            {/* Compact, Thumb-Friendly Docked Bottom Answer Form */}
            <DockedAnswerPane>
              {questionElement}
            </DockedAnswerPane>
          </div>
        )
      ) : (
        /* Standalone Question (intro, survey, user variable without document) */
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-sm">
            {questionElement}
          </div>
        </div>
      )}
    </div>
  );
}

export function JobRunner(props: JobRunnerProps) {
  return (
    <CoderSettingsProvider>
      <JobRunnerContent {...props} />
    </CoderSettingsProvider>
  );
}
