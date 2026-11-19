import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleDot, Layers, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NavigationPhase, StudyManagerNavigation } from "../studyManager/StudyManager";

// The left side of the coding screen's top bar (docs/client.md §2):
//
// - a menu with the study's top-level steps: its questions (numbered) and
//   its unit loops (label, unit `current / total`); a loop opens at the
//   coder's unit in it;
// - in a unit loop, the unit button: which unit, and a pager to go to
//   another (first, previous, a number, next, last);
// - the question's number, and back / forward.
//
// A study that is one unit loop has no menu: the unit button says it all.

const barButton = "flex h-8 items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15 cursor-pointer";

/** The steps listed in the menu: questions and unit loops. */
const listed = (phases: NavigationPhase[]) => phases.filter((p) => p.type === "question" || p.type === "unit_loop");

/** A question step's number among the study's top-level questions (1, 2, ...). */
function questionNumbers(phases: NavigationPhase[]): Map<number, number> {
  let n = 0;
  return new Map(phases.filter((p) => p.type === "question").map((p) => [p.index, ++n]));
}

/**
 * A loop's units: the coder's position (the current one, else how far they
 * got) and how many they get, if known (not in a shared queue without a
 * maximum).
 */
function loopUnits(phase: NavigationPhase, navigation: StudyManagerNavigation): { current: number; total: number | null } {
  const reached = phase.unitCount ?? 0;
  const current = phase.isCurrent ? (phase.currentUnitIndex ?? navigation.currentUnitIndex ?? 0) + 1 : reached;
  return { current, total: phase.totalUnits ? Math.max(current, reached, phase.totalUnits) : null };
}

/** "3 / 40", or "3" without a known total. */
const unitsText = ({ current, total }: { current: number; total: number | null }) => (total === null ? String(current) : `${current} / ${total}`);

export interface CodingNavProps {
  navigation: StudyManagerNavigation;
  /** The study's public title, at the top of the menu. */
  title: string | null;
  onJumpToPhase: (index: number) => void;
  /** Goes to a unit of the current loop (0-based; among the units the coder reached). */
  onJumpToUnit: (index: number) => void;
  onBack: () => void;
  onForward: () => void;
}

export function CodingNav({ navigation, title, onJumpToPhase, onJumpToUnit, onBack, onForward }: CodingNavProps) {
  const steps = listed(navigation.phases);
  const current = navigation.phases[navigation.currentPhaseIndex];
  const numbers = questionNumbers(navigation.phases);
  const onlyLoop = steps.length === 1 && steps[0].type === "unit_loop";

  // The question's number: a top-level question's, or in a loop its place in the unit (if the unit has several).
  let number: string | null = null;
  if (current?.type === "question") number = String(numbers.get(current.index) ?? "");
  else if (current?.type === "unit_loop" && (current.questions?.length ?? 0) > 1) {
    const q = current.questions!.findIndex((x) => x.isCurrent);
    if (q >= 0) number = String(q + 1);
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {!onlyLoop && <StepsMenu steps={steps} navigation={navigation} numbers={numbers} title={title} onJumpToPhase={onJumpToPhase} />}
      {current?.type === "unit_loop" && <UnitPager phase={current} navigation={navigation} onJumpToUnit={onJumpToUnit} />}
      {number && (
        <span
          className="inline-flex h-7 min-w-7 select-none items-center justify-center rounded-md bg-bar-foreground/15 px-2 font-mono text-xs font-semibold text-bar-foreground"
          title={`Question ${number}`}
        >
          {number}
        </span>
      )}
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

/** The menu: the study's questions and unit loops, to go to one the coder reached. */
function StepsMenu({
  steps,
  navigation,
  numbers,
  title,
  onJumpToPhase,
}: {
  steps: NavigationPhase[];
  navigation: StudyManagerNavigation;
  numbers: Map<number, number>;
  title: string | null;
  onJumpToPhase: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`${barButton} w-8`} title="Overview" aria-label="Overview">
          <Menu className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 shadow-lg">
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
                  onClick={() => {
                    onJumpToPhase(step.index);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    step.isCurrent
                      ? "bg-primary/10 font-semibold text-primary"
                      : reachable
                        ? "cursor-pointer text-foreground hover:bg-muted/60"
                        : "cursor-default text-muted-foreground/60"
                  }`}
                  title={step.label}
                >
                  <span className="min-w-[1.25rem] shrink-0 font-mono text-[10px] text-muted-foreground">
                    {step.type === "question" ? numbers.get(step.index) : <Layers className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {step.isCompleted ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : step.isCurrent ? (
                      <CircleDot className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                    )}
                  </span>
                  <span className="flex-1 truncate">{step.label}</span>
                  {units && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{unitsText(units)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The unit button: which unit of the loop; opens a pager to go to another unit the coder reached. */
function UnitPager({
  phase,
  navigation,
  onJumpToUnit,
}: {
  phase: NavigationPhase;
  navigation: StudyManagerNavigation;
  onJumpToUnit: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const units = loopUnits(phase, navigation);
  const { current, total } = units;
  const of = total === null ? "" : ` of ${total}`;
  // Units the coder can go to: those they reached (the last one is where they are coding)
  const reached = Math.max(1, phase.unitCount ?? navigation.totalUnitsInHistory);
  const [typed, setTyped] = useState<string | null>(null);
  const go = (n: number) => {
    const target = Math.max(1, Math.min(reached, n));
    setTyped(null);
    if (target !== current) onJumpToUnit(target - 1);
  };
  const pagerButton = "h-8 w-8 cursor-pointer";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setTyped(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${barButton} gap-1.5 bg-bar-foreground/15 px-2 font-mono text-xs font-semibold`}
          title={`${phase.label}: unit ${current}${of}`}
          aria-label={`Unit ${current}${of}`}
        >
          <Layers className="h-3.5 w-3.5" />
          {unitsText(units)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2 shadow-lg">
        <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">{phase.label}</p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className={pagerButton} disabled={current <= 1} onClick={() => go(1)} title="First unit" aria-label="First unit">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className={pagerButton} disabled={current <= 1} onClick={() => go(current - 1)} title="Previous unit" aria-label="Previous unit">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <form
            className="flex items-center gap-1 px-1 font-mono text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(typed);
              if (typed !== null && Number.isInteger(n)) go(n);
            }}
          >
            <input
              type="number"
              min={1}
              max={reached}
              value={typed ?? String(current)}
              onChange={(e) => setTyped(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={() => setTyped(null)}
              className="h-8 w-14 rounded-md border border-border bg-background px-1.5 text-center [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-inner-spin-button]:appearance-none"
              aria-label="Go to unit"
              title={`Go to a unit (1 to ${reached})`}
            />
            {total !== null && <span className="text-muted-foreground">/ {total}</span>}
          </form>
          <Button type="button" variant="ghost" size="icon" className={pagerButton} disabled={current >= reached} onClick={() => go(current + 1)} title="Next unit" aria-label="Next unit">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className={pagerButton} disabled={current >= reached} onClick={() => go(reached)} title="Last unit you reached" aria-label="Last unit you reached">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
