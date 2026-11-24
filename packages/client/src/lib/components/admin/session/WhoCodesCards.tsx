import type { Invite } from "@annotinder/contracts";
import { WHO_CODES } from "./whoCodes";
import { cn } from "cn";

/**
 * The choice of who codes: a card per mode, as radio buttons. `long`: the
 * longer explanation (the design page while nothing is chosen yet).
 */
export function WhoCodesCards({
  value,
  long = false,
  onChoose,
  learnMore,
}: {
  value: Invite["mode"] | null;
  long?: boolean;
  onChoose: (mode: Invite["mode"]) => void;
  /** A "Learn more" link under the cards (the guide). */
  learnMore?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn("grid gap-2", long ? "sm:grid-cols-2" : "grid-cols-2")}
        role="radiogroup"
        aria-label="Who codes"
      >
        {(["coders", "crowd"] as const).map((mode) => {
          const { icon: Icon, title, short, long: text } = WHO_CODES[mode];
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChoose(mode)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border text-left transition-colors",
                long ? "p-4" : "p-2.5",
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40",
              )}
            >
              <span className={cn("flex items-center gap-1.5 font-semibold", long ? "text-base" : "text-sm")}>
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                {title}
              </span>
              <span className={cn("text-muted-foreground", long ? "text-sm" : "text-[11px]")}>
                {long ? text : short}
              </span>
            </button>
          );
        })}
      </div>
      {learnMore && (
        <button type="button" onClick={learnMore} className="self-start text-xs text-primary hover:underline">
          Learn more about who codes
        </button>
      )}
    </div>
  );
}
