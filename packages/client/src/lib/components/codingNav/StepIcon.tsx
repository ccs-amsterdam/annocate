import { Check, CircleDot } from "lucide-react";

/** A step's state in a menu's list: done, the current one, or neither. */
export function StepIcon({ completed, current }: { completed: boolean; current: boolean }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
      <StepMark completed={completed} current={current} />
    </span>
  );
}

function StepMark({ completed, current }: { completed: boolean; current: boolean }) {
  if (completed) return <Check className="h-3.5 w-3.5 text-emerald-500" />;
  if (current) return <CircleDot className="h-3.5 w-3.5 text-primary" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />;
}
