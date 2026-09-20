import { useState, useMemo } from "react";
import { HttpJobServer } from "../api/httpJobServer";
import { useJobManager } from "../jobManager/useJobManager";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
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
  CircleDot,
  Check,
  Layers,
} from "lucide-react";

export interface JobRunnerProps {
  baseUrl: string;
  coderKey: string;
  inviteSecret?: string;
  onFinished?: () => void;
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
export function JobRunner({ baseUrl, coderKey, inviteSecret, onFinished }: JobRunnerProps) {
  const jobServer = useMemo(
    () => new HttpJobServer({ baseUrl, coderKey, inviteSecret }),
    [baseUrl, coderKey, inviteSecret],
  );
  const { manager, snapshot } = useJobManager(jobServer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [changingUnit, setChangingUnit] = useState(false);
  const [unitInputText, setUnitInputText] = useState("");

  function handleUnitJump() {
    const num = parseInt(unitInputText, 10);
    if (!isNaN(num) && num >= 1) {
      manager.jumpToUnit(num - 1);
      setChangingUnit(false);
      setMenuOpen(false);
    }
  }

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
  const spanVariable = item.type === "unit_variable" && item.variable.type === "span" ? item.variable : null;
  const hasUnitLayout = Boolean(snapshot.currentUnit && snapshot.currentUnitLayout);

  const questionElement = (
    <Question
      key={item.name}
      item={item}
      onAnswer={(value, conditionValue) => manager.answer(value, conditionValue)}
      unitVariables={snapshot.currentUnitVariables ?? undefined}
    />
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top App Header / Navigation Bar */}
      <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-primary/20 bg-primary px-3 text-primary-foreground shadow-sm">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Clean Menu Icon Button without "Annotinder" */}
          <Popover
            open={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) setChangingUnit(false);
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground hover:bg-primary-foreground/15 transition-colors cursor-pointer"
                title="Navigation menu"
                aria-label="Navigation menu"
              >
                <Menu className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2 shadow-xl" align="start">
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2 py-1 border-b border-border/60 text-xs font-semibold text-muted-foreground">
                  <span>Navigation</span>
                  <span className="font-mono text-[11px]">
                    {snapshot.navigation.phases.filter((p) => p.isCompleted).length} /{" "}
                    {snapshot.navigation.phases.length}
                  </span>
                </div>

                <div className="py-1 space-y-0.5 max-h-80 overflow-y-auto pr-0.5">
                  {snapshot.navigation.phases.map((phase) => {
                    if (phase.type === "unit_loop") {
                      const currentNum = (phase.currentUnitIndex ?? 0) + 1;
                      const totalNum = Math.max(1, phase.unitCount ?? snapshot.navigation.totalUnitsInHistory);

                      return (
                        <div key={phase.name} className="space-y-0.5 pt-0.5">
                          <div
                            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors ${
                              phase.isCurrent
                                ? "bg-muted/70 font-semibold text-foreground"
                                : "text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                manager.jumpToPhase(phase.index);
                                setMenuOpen(false);
                              }}
                              className="flex items-center gap-2 truncate cursor-pointer text-left flex-1"
                              title={`Unit ${currentNum} / ${totalNum}`}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {phase.isCompleted ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : phase.isCurrent ? (
                                  <Layers className="h-3.5 w-3.5 text-primary" />
                                ) : (
                                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                                )}
                              </span>
                              <span className="truncate font-mono">
                                Unit {currentNum} / {totalNum}
                              </span>
                            </button>

                            {phase.isCurrent && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUnitInputText(String(currentNum));
                                  setChangingUnit((v) => !v);
                                }}
                                className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                              >
                                Change
                              </button>
                            )}
                          </div>

                          {/* Inline Jump to Unit Input */}
                          {changingUnit && phase.isCurrent && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 rounded-md my-1 text-xs">
                              <span className="text-[11px] text-muted-foreground shrink-0">Go to unit:</span>
                              <input
                                type="number"
                                min={1}
                                max={totalNum}
                                value={unitInputText}
                                onChange={(e) => setUnitInputText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleUnitJump();
                                }}
                                className="h-6 w-14 rounded border border-input bg-background px-1.5 text-center text-xs font-mono"
                                autoFocus
                              />
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={handleUnitJump}
                              >
                                Go
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[11px] text-muted-foreground"
                                onClick={() => setChangingUnit(false)}
                              >
                                ✕
                              </Button>
                            </div>
                          )}

                          {/* Unit Questions (Indented child list) */}
                          {phase.questions && phase.questions.length > 0 && (
                            <div className="ml-3.5 space-y-0.5 border-l border-border/60 pl-2">
                              {phase.questions.map((q) => (
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
                                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                                    {q.isCompleted ? (
                                      <Check className="h-3 w-3 text-emerald-500" />
                                    ) : q.isCurrent ? (
                                      <CircleDot className="h-3 w-3 text-primary" />
                                    ) : (
                                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                                    )}
                                  </span>
                                  <span className="truncate">{q.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Coder / User Variable
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

          {/* Simple progress indicator in menu bar without unit name / externalId */}
          {snapshot.currentUnit && (
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary-foreground/15 px-2 py-0.5 text-xs font-mono font-medium text-primary-foreground">
                Unit {(snapshot.navigation.currentUnitIndex ?? 0) + 1} / {Math.max(1, snapshot.navigation.totalUnitsInHistory)}
              </span>
            </div>
          )}
        </div>

        {/* Stable Quick Back and Forward buttons on the right */}
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
              <div className="z-10 max-h-[52vh] sm:max-h-[48vh] flex flex-col min-h-0 shrink-0 border-t border-border bg-card/95 px-3.5 py-2.5 sm:px-6 sm:py-3.5 shadow-lg backdrop-blur overflow-y-auto">
                <div className="mx-auto w-full max-w-xl">
                  {questionElement}
                </div>
              </div>
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
            <div className="z-10 max-h-[52vh] sm:max-h-[48vh] flex flex-col min-h-0 shrink-0 border-t border-border bg-card/95 px-3.5 py-2.5 sm:px-6 sm:py-3.5 shadow-lg backdrop-blur overflow-y-auto">
              <div className="mx-auto w-full max-w-xl">
                {questionElement}
              </div>
            </div>
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
