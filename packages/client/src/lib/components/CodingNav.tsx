import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleDot, Layers, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NavigationPhase, StudyManagerNavigation } from "../studyManager/StudyManager";

// The left side of the coding screen's top bar (docs/client.md §2): one
// menu button that also says where the coder is ("3": the 3rd question;
// "4 · 2": unit 4, its 2nd question), and back / forward.
//
// The menu has two panels:
// - the study's steps: its questions and unit loops (a loop with the
//   coder's unit in it); a loop opens at the coder's unit, and shows its
//   panel;
// - in a unit loop, the loop's panel: which unit (type a number to go to
//   another), first / previous / next / furthest, and the unit's
//   questions. It opens on this panel while in a loop, with a way back to
//   the steps. A study that is one unit loop only has this panel.
//
// How far the coder is in the loop shows as a line along the bar's bottom
// edge (`CodingProgress`), when the loop's number of units is known.

const pagerButton = "h-9 flex-1 cursor-pointer";

/** The steps listed in the menu: questions and unit loops. */
const listed = (phases: NavigationPhase[]) => phases.filter((p) => p.type === "question" || p.type === "unit_loop");

/** A question step's number among the study's top-level questions (1, 2, ...). */
function questionNumber(phases: NavigationPhase[], phase: NavigationPhase): number {
  return phases.filter((p) => p.type === "question" && p.index <= phase.index).length;
}

/**
 * A loop's units: the coder's unit (the current one, else the furthest
 * they got), the furthest they reached, and how many they get, if known
 * (not in a shared queue without a maximum).
 */
function loopUnits(phase: NavigationPhase, navigation: StudyManagerNavigation): { current: number; reached: number; total: number | null } {
  const reached = Math.max(1, phase.unitCount ?? 0);
  const current = phase.isCurrent ? (phase.currentUnitIndex ?? navigation.currentUnitIndex ?? 0) + 1 : reached;
  return { current, reached, total: phase.totalUnits ? Math.max(reached, phase.totalUnits) : null };
}

export interface CodingNavProps {
  navigation: StudyManagerNavigation;
  /** The study's public title, at the top of the steps. */
  title: string | null;
  onJumpToPhase: (index: number) => void;
  /** Goes to a unit of the current loop (0-based; among the units the coder reached). */
  onJumpToUnit: (index: number) => void;
  /** Goes to a question of the current unit (its index among the loop's steps). */
  onJumpToQuestion: (index: number) => void;
  onBack: () => void;
  onForward: () => void;
}

export function CodingNav({ navigation, title, onJumpToPhase, onJumpToUnit, onJumpToQuestion, onBack, onForward }: CodingNavProps) {
  const steps = listed(navigation.phases);
  const current = navigation.phases[navigation.currentPhaseIndex];
  const inLoop = current?.type === "unit_loop";
  const onlyLoop = steps.length === 1 && steps[0].type === "unit_loop";
  const [open, setOpen] = useState(false);
  // Which panel: the steps, or a loop's (by its index; the loop the coder is in)
  const [panel, setPanel] = useState<"steps" | number>("steps");

  // Where the coder is: "3", or in a loop "4 · 2" (unit 4, 2nd question; just "4" if the unit has one question)
  let position: string | null = null;
  let positionTitle = "";
  if (current?.type === "question") {
    const n = questionNumber(navigation.phases, current);
    position = String(n);
    positionTitle = `Question ${n}`;
  } else if (inLoop) {
    const { current: unit } = loopUnits(current, navigation);
    const q = (current.questions ?? []).findIndex((x) => x.isCurrent);
    const several = (current.questions?.length ?? 0) > 1 && q >= 0;
    position = several ? `${unit} · ${q + 1}` : String(unit);
    positionTitle = several ? `Unit ${unit}, question ${q + 1}` : `Unit ${unit}`;
  }

  const loopPanel = panel === "steps" ? null : navigation.phases[panel];

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          // In a loop, the menu opens on the loop's panel
          if (o) setPanel(inLoop ? current.index : "steps");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-bar-foreground transition-colors hover:bg-bar-foreground/15"
            title={positionTitle ? `${positionTitle}: open the menu` : "Menu"}
            aria-label={positionTitle ? `Menu (${positionTitle})` : "Menu"}
          >
            {onlyLoop ? <Layers className="h-4 w-4" /> : <Menu className="h-5 w-5" />}
            {position && <span className="select-none font-mono text-xs font-semibold">{position}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-0 shadow-lg"
          // Not into the unit number: on a phone that would open the keyboard
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {loopPanel?.type === "unit_loop" && loopPanel.isCurrent ? (
            <LoopPanel
              phase={loopPanel}
              navigation={navigation}
              onBackToSteps={onlyLoop ? null : () => setPanel("steps")}
              onJumpToUnit={onJumpToUnit}
              onJumpToQuestion={(index) => {
                onJumpToQuestion(index);
                setOpen(false);
              }}
            />
          ) : (
            <StepsPanel
              steps={steps}
              navigation={navigation}
              title={title}
              onPick={(step) => {
                onJumpToPhase(step.index);
                // A loop: its panel, once the coder is in it; a question: done
                if (step.type === "unit_loop") setPanel(step.index);
                else setOpen(false);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 cursor-pointer text-bar-foreground hover:bg-bar-foreground/15 disabled:opacity-30"
          disabled={!navigation.canGoBack}
          onClick={onBack}
          title="Previous"
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 cursor-pointer text-bar-foreground hover:bg-bar-foreground/15 disabled:opacity-30"
          disabled={!navigation.canGoForward}
          onClick={onForward}
          title="Next"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** How far the coder is in the loop they are in: a line along the bar's bottom edge (put it in a relative bar). */
export function CodingProgress({ navigation }: { navigation: StudyManagerNavigation }) {
  const current = navigation.phases[navigation.currentPhaseIndex];
  if (current?.type !== "unit_loop") return null;
  const { reached, total } = loopUnits(current, navigation);
  if (total === null) return null;
  // Units done: those before the furthest one
  const done = Math.min(1, (reached - 1) / total);
  return (
    <div
      role="progressbar"
      aria-label="Units done"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={reached - 1}
      title={`${reached - 1} of ${total} units done`}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-bar-foreground/10"
    >
      <div className="h-full bg-leaf transition-[width] duration-300" style={{ width: `${done * 100}%` }} />
    </div>
  );
}

function StepIcon({ step }: { step: NavigationPhase }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
      {step.isCompleted ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : step.isCurrent ? (
        <CircleDot className="h-3.5 w-3.5 text-primary" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      )}
    </span>
  );
}

/** The study's steps: questions and unit loops, to go to one the coder reached. */
function StepsPanel({
  steps,
  navigation,
  title,
  onPick,
}: {
  steps: NavigationPhase[];
  navigation: StudyManagerNavigation;
  title: string | null;
  onPick: (step: NavigationPhase) => void;
}) {
  return (
    <div className="flex max-h-[80vh] flex-col">
      {title && <p className="border-b border-border/60 px-3.5 py-2.5 text-sm font-semibold text-foreground">{title}</p>}
      <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {steps.map((step) => {
          const reachable = step.index <= navigation.maxReachedTopIndex;
          const units = step.type === "unit_loop" ? loopUnits(step, navigation) : null;
          return (
            <button
              key={step.name || step.index}
              type="button"
              disabled={!reachable}
              onClick={() => onPick(step)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                step.isCurrent
                  ? "bg-primary/10 font-semibold text-primary"
                  : reachable
                    ? "cursor-pointer text-foreground hover:bg-muted/60"
                    : "cursor-default text-muted-foreground/60"
              }`}
              title={step.label}
            >
              {step.type === "unit_loop" ? <Layers className="h-4 w-4 shrink-0 text-primary" /> : <StepIcon step={step} />}
              <span className="flex-1 truncate">{step.label}</span>
              {units && (
                <span className="flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-muted-foreground">
                  {units.total === null ? units.current : `${units.current} / ${units.total}`}
                  {reachable && <ChevronRight className="h-3.5 w-3.5" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The loop the coder is in: which unit (type a number to go to another), first / previous / next / furthest, and the unit's questions. */
function LoopPanel({
  phase,
  navigation,
  onBackToSteps,
  onJumpToUnit,
  onJumpToQuestion,
}: {
  phase: NavigationPhase;
  navigation: StudyManagerNavigation;
  /** Back to the steps; null in a study that is just this loop. */
  onBackToSteps: (() => void) | null;
  onJumpToUnit: (index: number) => void;
  onJumpToQuestion: (index: number) => void;
}) {
  const { current, reached, total } = loopUnits(phase, navigation);
  const [typed, setTyped] = useState<string | null>(null);
  const go = (n: number) => {
    setTyped(null);
    const target = Math.max(1, Math.min(reached, n));
    if (target !== current) onJumpToUnit(target - 1);
  };
  const typedNumber = typed === null ? null : Number(typed);
  const tooFar = typedNumber !== null && Number.isInteger(typedNumber) && typedNumber > reached;
  const questions = phase.questions ?? [];

  return (
    <div className="flex max-h-[80vh] flex-col">
      {onBackToSteps && (
        <button
          type="button"
          onClick={onBackToSteps}
          className="flex cursor-pointer items-center gap-1 border-b border-border/60 px-2.5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All steps
        </button>
      )}
      <div className="flex flex-col gap-2 p-3">
        <form
          className="flex items-baseline justify-center gap-1.5 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (typedNumber !== null && Number.isInteger(typedNumber)) go(typedNumber);
          }}
        >
          Unit
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={typed ?? String(current)}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
            onFocus={(e) => e.target.select()}
            onBlur={() => setTyped(null)}
            size={Math.max(2, String(typed ?? current).length)}
            className="rounded-md border border-transparent bg-transparent px-1 text-center font-mono font-semibold text-foreground hover:border-input focus:border-input focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Go to unit"
            title="Type a unit number and press Enter"
          />
          {total !== null && <span className="text-muted-foreground">of {total}</span>}
        </form>
        {tooFar && <p className="-mt-1 text-center text-[11px] text-muted-foreground">You can go up to unit {reached}</p>}
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className={pagerButton} disabled={current <= 1} onClick={() => go(1)} title="First unit" aria-label="First unit">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className={pagerButton} disabled={current <= 1} onClick={() => go(current - 1)} title="Previous unit" aria-label="Previous unit">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className={pagerButton} disabled={current >= reached} onClick={() => go(current + 1)} title="Next unit" aria-label="Next unit">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={pagerButton}
            disabled={current >= reached}
            onClick={() => go(reached)}
            title="The furthest unit you reached"
            aria-label="The furthest unit you reached"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {questions.length > 1 && (
        <div className="flex-1 space-y-0.5 overflow-y-auto border-t border-border/60 p-1.5">
          {questions.map((q) => (
            <button
              key={q.name}
              type="button"
              onClick={() => onJumpToQuestion(q.index)}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                q.isCurrent ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted/60"
              }`}
              title={q.label}
            >
              <StepIcon step={{ ...phase, isCompleted: q.isCompleted, isCurrent: q.isCurrent }} />
              <span className="truncate">{q.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
