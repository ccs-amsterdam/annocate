import { Layers } from "lucide-react";
import type { NavigationPhase, StudyManagerNavigation } from "../../studyManager/types";
import { listedSteps, loopUnits } from "./navigation";
import { StepIcon } from "./StepIcon";
import { rowClass } from "./styles";

/** The study's questions and unit loops the coder got to, to go back to one. */
export function Overview({
  navigation,
  title,
  onPick,
}: {
  navigation: StudyManagerNavigation;
  title: string | null;
  onPick: (step: NavigationPhase) => void;
}) {
  return (
    <div className="flex max-h-[70vh] flex-col">
      {title && (
        <p className="border-b border-border/60 px-3.5 py-2.5 text-sm font-semibold text-foreground">{title}</p>
      )}
      <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {listedSteps(navigation).map((step) => (
          <button
            key={step.name || step.index}
            type="button"
            onClick={() => onPick(step)}
            className={rowClass(step.isCurrent)}
            title={step.label}
          >
            {step.type === "unit_loop" ? (
              <Layers className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <StepIcon completed={step.isCompleted} current={step.isCurrent} />
            )}
            <span className="flex-1 truncate">{step.label}</span>
            {step.type === "unit_loop" && <LoopUnitCount loop={step} navigation={navigation} />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Where the coder is in a loop: "4", or "4 / 20" when the number of units is known. */
function LoopUnitCount({ loop, navigation }: { loop: NavigationPhase; navigation: StudyManagerNavigation }) {
  const { current, total } = loopUnits(loop, navigation);
  return (
    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
      {total === null ? current : `${current} / ${total}`}
    </span>
  );
}
