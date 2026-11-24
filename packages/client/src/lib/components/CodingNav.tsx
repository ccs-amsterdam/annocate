import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Layers, Menu } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COMMAND_BADGES } from "../keyboard/commands";
import { useMenuKeys } from "../keyboard/hooks";
import type { NavigationPhase, StudyManagerNavigation } from "../studyManager/types";
import { LoopPanel } from "./codingNav/LoopPanel";
import { isOnlyLoop, positionOf, type Position } from "./codingNav/navigation";
import { Overview } from "./codingNav/Overview";
import { barButton } from "./codingNav/styles";
import { ShortcutBadge } from "./ShortcutBadge";

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

const chip = "h-7 min-w-7 gap-1 px-2 text-xs font-semibold tabular-nums";

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
  const current = navigation.phases[navigation.currentPhaseIndex];
  const loop = current?.type === "unit_loop" ? current : null;
  const position = positionOf(navigation);
  const [openMenu, setMenu] = useState<"main" | "loop" | null>(null);
  // Out of the loop (e.g. back to a question), its menu is gone
  const menu = openMenu === "loop" && !loop ? null : openMenu;
  useMenuKeys(menu !== null);

  const pickStep = (step: NavigationPhase) => {
    setMenu(null);
    if (!step.isCurrent) onJumpToPhase(step.index);
  };
  const pickQuestion = (index: number) => {
    onJumpToQuestion(index);
    setMenu(null);
  };

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {!isOnlyLoop(navigation) && (
        <StudyMenu open={menu === "main"} onOpenChange={(open) => setMenu(open ? "main" : null)}>
          <Overview navigation={navigation} title={title} onPick={pickStep} />
        </StudyMenu>
      )}
      {loop && position && (
        <LoopMenu
          loop={loop}
          position={position}
          open={menu === "loop"}
          onOpenChange={(open) => setMenu(open ? "loop" : null)}
        >
          <LoopPanel phase={loop} navigation={navigation} onJumpToUnit={onJumpToUnit} onJumpToQuestion={pickQuestion} />
        </LoopMenu>
      )}
      {!loop && position && <PositionChip position={position} />}
      <div className="flex shrink-0 items-center gap-0.5">
        <MoveButton
          label="Previous"
          title="Previous (Ctrl + ←)"
          shortcut={COMMAND_BADGES.back}
          disabled={!navigation.canGoBack}
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </MoveButton>
        <MoveButton
          label="Next"
          title="Next (Ctrl + →)"
          shortcut={COMMAND_BADGES.forward}
          disabled={!navigation.canGoForward}
          onClick={onForward}
        >
          <ChevronRight className="h-4 w-4" />
        </MoveButton>
      </div>
    </div>
  );
}

interface MenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The menu's content. */
  children: ReactNode;
}

/** The menu (☰) of the study's steps. */
function StudyMenu({ open, onOpenChange, children }: MenuProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** The loop's button (its icon and where the coder is), which opens the loop's units. */
function LoopMenu({
  loop,
  position,
  open,
  onOpenChange,
  children,
}: MenuProps & { loop: NavigationPhase; position: Position }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(barButton, chip, "bg-bar-foreground/15")}
          title={`${loop.label}: ${position.title}`}
          aria-label={`${loop.label}, ${position.title}: open the units`}
        >
          <Layers className="h-3.5 w-3.5" />
          {position.text}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 shadow-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Outside loops: the question's number. */
function PositionChip({ position }: { position: Position }) {
  return (
    <span
      className={cn("flex items-center justify-center rounded-lg text-bar-foreground/80", chip)}
      title={position.title}
    >
      {position.text}
    </span>
  );
}

/** Back or forward, with its shortcut's badge. */
function MoveButton({
  label,
  title,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative h-7 w-7 cursor-pointer text-bar-foreground hover:bg-bar-foreground/15 disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={label}
    >
      <ShortcutBadge shortcut={shortcut} position="top-right" />
      {children}
    </Button>
  );
}
