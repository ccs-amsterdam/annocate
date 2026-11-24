import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/**
 * Which unit of the loop the coder is at, with first / previous / next /
 * furthest around it. The unit's number opens the number pad; while that is
 * open it shows the number typed so far.
 */
export function UnitStepper({
  current,
  reached,
  total,
  typed,
  onGo,
  onTogglePad,
}: {
  /** The coder's unit and the furthest they reached (1-based), and how many they get, if known. */
  current: number;
  reached: number;
  total: number | null;
  /** The number pad: the number typed so far ("" while empty), or null while closed. */
  typed: string | null;
  onGo: (unit: number) => void;
  onTogglePad: () => void;
}) {
  const padOpen = typed !== null;
  return (
    <div className="flex items-center justify-between gap-1 p-1.5">
      <span className="flex">
        <StepButton label="First unit" disabled={current <= 1} onClick={() => onGo(1)}>
          <ChevronsLeft className="h-4 w-4" />
        </StepButton>
        <StepButton label="Previous unit" disabled={current <= 1} onClick={() => onGo(current - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </StepButton>
      </span>
      <button
        type="button"
        onClick={onTogglePad}
        className={cn(
          "cursor-pointer rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted",
          padOpen && "bg-muted",
        )}
        title="Go to a unit by its number"
        aria-expanded={padOpen}
      >
        Unit <span className="font-mono font-semibold">{padOpen ? typed || "…" : current}</span>
        {total !== null && <span className="text-muted-foreground"> of {total}</span>}
      </button>
      <span className="flex">
        <StepButton label="Next unit" disabled={current >= reached} onClick={() => onGo(current + 1)}>
          <ChevronRight className="h-4 w-4" />
        </StepButton>
        <StepButton label="The furthest unit you reached" disabled={current >= reached} onClick={() => onGo(reached)}>
          <ChevronsRight className="h-4 w-4" />
        </StepButton>
      </span>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 cursor-pointer"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );
}
