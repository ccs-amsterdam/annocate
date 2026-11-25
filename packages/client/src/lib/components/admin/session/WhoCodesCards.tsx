import type { CoderKind } from "@annotinder/contracts";
import { WHO_CODES } from "./whoCodes";
import { cn } from "cn";

/**
 * The choice of who codes (the design's Who codes): a card per kind of
 * coders, as radio buttons. `long`: the longer explanation (while nothing
 * is chosen yet).
 */
export function WhoCodesCards({
  value,
  long = false,
  onChoose,
  learnMore,
}: {
  value: CoderKind | null;
  long?: boolean;
  onChoose: (kind: CoderKind) => void;
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
        {(["expert", "crowd"] as const).map((kind) => {
          const { icon: Icon, title, short, long: text } = WHO_CODES[kind];
          const active = value === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChoose(kind)}
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
