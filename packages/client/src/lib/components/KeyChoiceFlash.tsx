import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { useKeyChoice } from "../keyboard/keyChoice";
import { useLeader } from "../keyboard/leader";

/** How long the chosen answer shows. */
const SHOW_MS = 900;

/**
 * The answer a key just chose, in a small badge at the bottom of the coding
 * screen that pops in and fades: a wrong key is seen at once, also when the
 * question moves on right away.
 */
export function KeyChoiceFlash() {
  const choice = useKeyChoice();
  const leader = useLeader();
  const [hidden, setHidden] = useState<number | null>(null);
  useEffect(() => {
    if (!choice) return;
    const timer = setTimeout(() => setHidden(choice.n), SHOW_MS);
    return () => clearTimeout(timer);
  }, [choice]);
  if (leader) return <LeaderHint />;
  if (!choice || hidden === choice.n) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center" aria-hidden>
      <div
        key={choice.n}
        className="flex animate-in items-center gap-2 rounded-full bg-foreground px-3.5 py-1.5 text-sm font-medium text-background shadow-lg duration-200 zoom-in-75 fade-in"
      >
        <Keyboard className="h-4 w-4 opacity-70" />
        <kbd className="rounded bg-background/20 px-1.5 font-mono text-xs">{choice.key}</kbd>
        {choice.label}
      </div>
    </div>
  );
}

/** The commands after the leader key (/), while it waits for one. */
function LeaderHint() {
  const keys: [string, string][] = [
    ["↵", "continue"],
    ["← →", "back, next (4 6)"],
    ["␣", "instruction (0)"],
    ["8", "don't know"],
    ["9", "not applicable"],
    ["/", "cancel"],
  ];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="status">
      <div className="flex animate-in flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-foreground px-3.5 py-1.5 text-xs text-background shadow-lg duration-150 fade-in">
        <kbd className="rounded bg-background/20 px-1.5 font-mono">/</kbd>
        {keys.map(([key, what]) => (
          <span key={key} className="flex items-center gap-1">
            <kbd className="rounded bg-background/20 px-1 font-mono">{key}</kbd>
            {what}
          </span>
        ))}
      </div>
    </div>
  );
}
