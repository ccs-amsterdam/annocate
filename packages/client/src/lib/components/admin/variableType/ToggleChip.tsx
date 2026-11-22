import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * A small monospace button that switches a name on or off, e.g. a unit
 * field a span question selects in. `missing`: the name is chosen but no
 * longer available (shown in red, with `title` saying why).
 */
export function ToggleChip({
  on,
  missing = false,
  title,
  pressed,
  onClick,
  children,
}: {
  on: boolean;
  missing?: boolean;
  title?: string;
  /** Sets `aria-pressed`. */
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={title}
      className={cn(
        "cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[11px]",
        missing
          ? "border-destructive text-destructive"
          : on
            ? "border-primary bg-primary/15 text-primary"
            : "border-border text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
