import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * Explanation behind an info icon: opens on click (and keyboard), so text that
 * isn't needed every time stays out of the way.
 */
export function InfoTip({ children, label = "More information", className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 text-xs leading-relaxed text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}
