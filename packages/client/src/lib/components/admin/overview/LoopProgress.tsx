import type { DeploymentStatus } from "@annotinder/contracts";

/**
 * Progress per unitset of each loop, as the job server sees it: complete
 * units (every routed coder finished them, or the saturation rule was met
 * for dynamic sources) out of all units.
 */
export function LoopProgress({ status }: { status: DeploymentStatus }) {
  if (status.sources.length === 0) {
    return <p className="text-sm text-muted-foreground">The live codebook has no unit loops.</p>;
  }
  return (
    <ul className="space-y-3">
      {status.sources.map((s) => {
        const pct = s.totalUnits === 0 ? 0 : Math.round((s.completeUnits / s.totalUnits) * 100);
        return (
          <li key={`${s.loop}/${s.unitset}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">
                <span className="font-mono">{s.loop}</span>
                <span className="text-muted-foreground"> · {s.unitset}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {s.completeUnits} / {s.totalUnits} complete · {s.coders} coder{s.coders === 1 ? "" : "s"}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-primary/15"
              role="meter"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${s.loop}, ${s.unitset}: ${pct}% complete`}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
