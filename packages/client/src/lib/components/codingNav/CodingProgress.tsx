import type { StudyManagerNavigation } from "../../studyManager/types";
import { loopUnits } from "./navigation";

/** How far the coder is in the loop they are in: a line along the bar's bottom edge (put it in a relative bar). */
export function CodingProgress({ navigation }: { navigation: StudyManagerNavigation }) {
  const current = navigation.phases[navigation.currentPhaseIndex];
  if (current?.type !== "unit_loop") return null;
  const { current: at, reached, total } = loopUnits(current, navigation);
  if (total === null) return null;
  // Units done: those before the furthest one
  const done = Math.min(1, (reached - 1) / total);
  // Gone back to an earlier unit: a marker where the coder is now
  const back = at < reached;
  return (
    <div
      role="progressbar"
      aria-label="Units done"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={reached - 1}
      title={`${reached - 1} of ${total} units done${back ? `; now at unit ${at}` : ""}`}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-bar-foreground/10"
    >
      <div className="h-full bg-leaf transition-[width] duration-300" style={{ width: `${done * 100}%` }} />
      {back && (
        <div
          data-progress-current=""
          aria-hidden="true"
          className="absolute -top-0.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-bar-foreground transition-[left] duration-300"
          style={{ left: `${((at - 0.5) / total) * 100}%` }}
        />
      )}
    </div>
  );
}
