import { useState } from "react";
import { PRIORITY } from "../keyboard/controller";
import { useKeyScope } from "../keyboard/hooks";
import { ShortcutBadge } from "./ShortcutBadge";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  Delete,
  Layers,
  Menu,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NavigationPhase, StudyManagerNavigation } from "../studyManager/types";

// The left side of the coding screen's top bar (docs/client.md §2):
// - the menu (☰): the study's questions and unit loops the coder got to,
//   to go back to one; not there if the study is one unit loop only;
// - in a unit loop, the loop's button (its icon and where the coder is:
//   "4", or "4 · 2" for unit 4's 2nd question): which unit, first /
//   previous / next / furthest, a number pad to go to a unit, and the
//   unit's questions the coder got to;
// - outside loops, the question's number;
// - back / forward.
// Questions the coder hasn't got to are never listed: conditions may skip them.
//
// While a menu is open, keys are the menu's (the number pad), never the
// answer shortcuts of the question behind it (an exclusive keyboard scope).
//
// How far the coder is in the loop shows as a line along the bar's bottom
// edge (`CodingProgress`), when the loop's number of units is known.

const barButton =
  "flex h-8 cursor-pointer items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15";

/** The steps listed in the menu: questions and unit loops the coder got to. */
const listed = (navigation: StudyManagerNavigation) =>
  navigation.phases.filter(
    (p) => (p.type === "question" || p.type === "unit_loop") && p.index <= navigation.maxReachedTopIndex,
  );

/** A question step's number among the study's top-level questions (1, 2, ...). */
function questionNumber(phases: NavigationPhase[], phase: NavigationPhase): number {
  return phases.filter((p) => p.type === "question" && p.index <= phase.index).length;
}

/**
 * A loop's units: the coder's unit (the current one, else the furthest
 * they got), the furthest they reached, and how many they get, if known
 * (not in a shared queue without a maximum).
 */
function loopUnits(
  phase: NavigationPhase,
  navigation: StudyManagerNavigation,
): { current: number; reached: number; total: number | null } {
  const reached = Math.max(1, phase.unitCount ?? 0);
  const current = phase.isCurrent ? (phase.currentUnitIndex ?? navigation.currentUnitIndex ?? 0) + 1 : reached;
  return { current, reached, total: phase.totalUnits ? Math.max(reached, phase.totalUnits) : null };
}

/** While `active` (a menu is open), keys never reach the question behind the menu. */
function useMenuKeys(active: boolean) {
  useKeyScope(() => false, active, { priority: PRIORITY.menu, exclusive: true });
}

export interface CodingNavProps {
  navigation: StudyManagerNavigation;
  /** The study's public title, at the top of the menu. */
  title: string | null;
  onJumpToPhase: (index: number) => void;
  /** Goes to a unit of the current loop (0-based; among the units the coder reached). */
  onJumpToUnit: (index: number) => void;
  /** Goes to a question of the current unit (its index among the loop's steps). */
  onJumpToQuestion: (index: number) => void;
  onBack: () => void;
  onForward: () => void;
}

export function CodingNav({
  navigation,
  title,
  onJumpToPhase,
  onJumpToUnit,
  onJumpToQuestion,
  onBack,
  onForward,
}: CodingNavProps) {
  const steps = listed(navigation);
  const current = navigation.phases[navigation.currentPhaseIndex];
  const inLoop = current?.type === "unit_loop";
  const loops = navigation.phases.filter((p) => p.type === "unit_loop").length;
  const onlyLoop = loops === 1 && navigation.phases.every((p) => p.type !== "question");
  const [openMenu, setMenu] = useState<"main" | "loop" | null>(null);
  // Out of the loop (e.g. back to a question), its menu is gone
  const menu = openMenu === "loop" && !inLoop ? null : openMenu;
  useMenuKeys(menu !== null);

  // Where the coder is: "3", or in a loop "4 · 2" (unit 4, 2nd question; just "4" if the loop has one question)
  let position: string | null = null;
  let positionTitle = "";
  if (current?.type === "question") {
    const n = questionNumber(navigation.phases, current);
    position = String(n);
    positionTitle = `Question ${n}`;
  } else if (inLoop) {
    const { current: unit } = loopUnits(current, navigation);
    const q = (current.questions ?? []).findIndex((x) => x.isCurrent);
    // The loop's questions, not those reached so far: "4 · 1" from the unit's first question
    const several = (current.questionCount ?? 0) > 1 && q >= 0;
    position = several ? `${unit} · ${q + 1}` : String(unit);
    positionTitle = several ? `Unit ${unit}, question ${q + 1}` : `Unit ${unit}`;
  }
  const chip = "h-7 min-w-7 gap-1 px-2 text-xs font-semibold tabular-nums";

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {!onlyLoop && (
        <Popover open={menu === "main"} onOpenChange={(o) => setMenu(o ? "main" : null)}>
          <PopoverTrigger asChild>
            <button type="button" className={cn(barButton, "w-8")} title="Menu" aria-label="Menu">
              <Menu className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 p-0 shadow-lg"
            // Not into the menu's buttons: arrows and numbers stay the menu's, Esc closes it
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Overview
              steps={steps}
              navigation={navigation}
              title={title}
              onPick={(step) => {
                setMenu(null);
                if (!step.isCurrent) onJumpToPhase(step.index);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
      {inLoop ? (
        <Popover open={menu === "loop"} onOpenChange={(o) => setMenu(o ? "loop" : null)}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(barButton, chip, "bg-bar-foreground/15")}
              title={`${current.label}: ${positionTitle}`}
              aria-label={`${current.label}, ${positionTitle}: open the units`}
            >
              <Layers className="h-3.5 w-3.5" />
              {position}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0 shadow-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
            <LoopPanel
              phase={current}
              navigation={navigation}
              onJumpToUnit={onJumpToUnit}
              onJumpToQuestion={(index) => {
                onJumpToQuestion(index);
                setMenu(null);
              }}
            />
          </PopoverContent>
        </Popover>
      ) : (
        position && (
          <span
            className={cn("flex items-center justify-center rounded-lg text-bar-foreground/80", chip)}
            title={positionTitle}
          >
            {position}
          </span>
        )
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-7 w-7 cursor-pointer text-bar-foreground hover:bg-bar-foreground/15 disabled:opacity-30"
          disabled={!navigation.canGoBack}
          onClick={onBack}
          title="Previous (Shift + ←)"
          aria-label="Previous"
        >
          <ShortcutBadge shortcut="⇧←" position="top-right" />
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-7 w-7 cursor-pointer text-bar-foreground hover:bg-bar-foreground/15 disabled:opacity-30"
          disabled={!navigation.canGoForward}
          onClick={onForward}
          title="Next (Shift + →)"
          aria-label="Next"
        >
          <ShortcutBadge shortcut="⇧→" position="top-right" />
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
  const { current: at, reached, total } = loopUnits(current, navigation);
  if (total === null) return null;
  // Units done: those before the furthest one
  const done = Math.min(1, (reached - 1) / total);
  // Gone back to an earlier unit: a marker where the coder is now
  const back = at < reached;
  return (
    <div
      role="progressbar"
      aria-label="Units done"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={reached - 1}
      title={`${reached - 1} of ${total} units done${back ? `; now at unit ${at}` : ""}`}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-bar-foreground/10"
    >
      <div className="h-full bg-leaf transition-[width] duration-300" style={{ width: `${done * 100}%` }} />
      {back && (
        <div
          data-progress-current=""
          aria-hidden="true"
          className="absolute -top-0.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-bar-foreground transition-[left] duration-300"
          style={{ left: `${((at - 0.5) / total) * 100}%` }}
        />
      )}
    </div>
  );
}

function StepIcon({ completed, current }: { completed: boolean; current: boolean }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
      {completed ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : current ? (
        <CircleDot className="h-3.5 w-3.5 text-primary" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      )}
    </span>
  );
}

const rowClass = (current: boolean) =>
  cn(
    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
    current ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted/60",
  );

/** The study's questions and unit loops the coder got to, to go back to one. */
function Overview({
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
    <div className="flex max-h-[70vh] flex-col">
      {title && (
        <p className="border-b border-border/60 px-3.5 py-2.5 text-sm font-semibold text-foreground">{title}</p>
      )}
      <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {steps.map((step) => {
          const units = step.type === "unit_loop" ? loopUnits(step, navigation) : null;
          return (
            <button
              key={step.name || step.index}
              type="button"
              onClick={() => onPick(step)}
              className={rowClass(step.isCurrent)}
              title={step.label}
            >
              {step.type === "unit_loop" ? (
                <Layers className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <StepIcon completed={step.isCompleted} current={step.isCurrent} />
              )}
              <span className="flex-1 truncate">{step.label}</span>
              {units && (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {units.total === null ? units.current : `${units.current} / ${units.total}`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The loop the coder is in: which unit, first / previous / next / furthest, a number pad, and the unit's questions. */
function LoopPanel({
  phase,
  navigation,
  onJumpToUnit,
  onJumpToQuestion,
}: {
  phase: NavigationPhase;
  navigation: StudyManagerNavigation;
  onJumpToUnit: (index: number) => void;
  onJumpToQuestion: (index: number) => void;
}) {
  const { current, reached, total } = loopUnits(phase, navigation);
  // The number pad: the number typed so far ("" while empty), or closed
  const [typed, setTyped] = useState<string | null>(null);
  const go = (n: number) => {
    setTyped(null);
    const target = Math.max(1, Math.min(reached, n));
    if (target !== current) onJumpToUnit(target - 1);
  };
  const press = (key: string) => {
    if (key === "back") setTyped((t) => (t ?? "").slice(0, -1));
    else if (key === "go") {
      if (typed) go(Number(typed));
    } else setTyped((t) => ((t ?? "") + key).replace(/^0+/, "").slice(0, 6));
  };
  const tooFar = typed !== null && Number(typed) > reached;

  // While the menu is open, number keys type a unit's number, Backspace and Enter edit and go
  // (above the menu's own exclusive scope, which keeps all other keys from the question)
  useKeyScope(
    ({ key }) => {
      if (/^[0-9]$/.test(key)) press(key);
      else if (typed !== null && key === "Backspace") press("back");
      else if (typed !== null && key === "Enter") press("go");
      else return false;
      return true;
    },
    true,
    { priority: PRIORITY.menu + 1 },
  );

  const small = "h-7 w-7 cursor-pointer";
  const questions = phase.questions ?? [];
  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center justify-between gap-1 p-1.5">
        <span className="flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={small}
            disabled={current <= 1}
            onClick={() => go(1)}
            title="First unit"
            aria-label="First unit"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={small}
            disabled={current <= 1}
            onClick={() => go(current - 1)}
            title="Previous unit"
            aria-label="Previous unit"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </span>
        <button
          type="button"
          onClick={() => setTyped(typed === null ? "" : null)}
          className={cn(
            "cursor-pointer rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted",
            typed !== null && "bg-muted",
          )}
          title="Go to a unit by its number"
          aria-expanded={typed !== null}
        >
          Unit <span className="font-mono font-semibold">{typed === null ? current : typed || "…"}</span>
          {total !== null && <span className="text-muted-foreground"> of {total}</span>}
        </button>
        <span className="flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={small}
            disabled={current >= reached}
            onClick={() => go(current + 1)}
            title="Next unit"
            aria-label="Next unit"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={small}
            disabled={current >= reached}
            onClick={() => go(reached)}
            title="The furthest unit you reached"
            aria-label="The furthest unit you reached"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </span>
      </div>
      {typed !== null && (
        <div className="flex flex-col items-center gap-1.5 border-t border-border/60 p-2">
          <div className="grid grid-cols-3 gap-1">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
              <Button
                key={k}
                type="button"
                variant="outline"
                className="h-8 w-12 cursor-pointer font-mono"
                onClick={() => press(k)}
              >
                {k}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="h-8 w-12 cursor-pointer"
              onClick={() => press("back")}
              aria-label="Delete a digit"
            >
              <Delete className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-8 w-12 cursor-pointer font-mono"
              onClick={() => press("0")}
            >
              0
            </Button>
            <Button
              type="button"
              className="h-8 w-12 cursor-pointer text-xs"
              disabled={!typed}
              onClick={() => press("go")}
            >
              Go
            </Button>
          </div>
          <p className={cn("text-[11px]", tooFar ? "text-foreground" : "text-muted-foreground")}>
            {tooFar ? `You can go up to unit ${reached}` : `Units 1 to ${reached} (the furthest you reached)`}
          </p>
        </div>
      )}
      {typed === null && questions.length > 1 && (
        <div className="flex-1 space-y-0.5 overflow-y-auto border-t border-border/60 p-1.5">
          {questions.map((q) => (
            <button
              key={q.name}
              type="button"
              onClick={() => onJumpToQuestion(q.index)}
              className={rowClass(q.isCurrent)}
              title={q.label}
            >
              <StepIcon completed={q.isCompleted} current={q.isCurrent} />
              <span className="truncate">{q.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
