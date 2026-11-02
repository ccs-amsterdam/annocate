import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

interface SegmentedToggleProps<T extends string> {
  value: T;
  options: { value: T; label: string; icon: LucideIcon }[];
  onChange: (value: T) => void;
  /** "muted": the active option looks raised; "primary": it's filled with the primary colour. */
  variant?: "muted" | "primary";
}

/** A small row of mutually exclusive buttons, e.g. Visual | JSON. */
export function SegmentedToggle<T extends string>({ value, options, onChange, variant = "muted" }: SegmentedToggleProps<T>) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-border p-0.5",
        variant === "muted" ? "bg-muted/40" : "bg-card",
      )}
    >
      {options.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            option !== value && "text-muted-foreground hover:text-foreground",
            option === value && variant === "muted" && "bg-card text-foreground shadow-xs",
            option === value && variant === "primary" && "bg-primary text-primary-foreground shadow-xs",
          )}
        >
          <Icon className={variant === "muted" ? "h-3.5 w-3.5" : "h-3 w-3"} />
          {label}
        </button>
      ))}
    </div>
  );
}
