import { useState } from "react";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope } from "../../keyboard/hooks";
import type { NavigationPhase, NavigationUnitQuestion, StudyManagerNavigation } from "../../studyManager/types";
import { loopUnits } from "./navigation";
import { StepIcon } from "./StepIcon";
import { rowClass } from "./styles";
import { UnitNumberPad, type PadKey } from "./UnitNumberPad";
import { UnitStepper } from "./UnitStepper";

/** The loop the coder is in: which unit, first / previous / next / furthest, a number pad, and the unit's questions. */
export function LoopPanel({
  phase,
  navigation,
  onJumpToUnit,
  onJumpToQuestion,
}: {
  phase: NavigationPhase;
  navigation: StudyManagerNavigation;
  onJumpToUnit: (index: number) => void;
  onJumpToQuestion: (index: number) => void;
}) {
  const { current, reached, total } = loopUnits(phase, navigation);
  // The number pad: the number typed so far ("" while empty), or closed
  const [typed, setTyped] = useState<string | null>(null);
  const go = (unit: number) => {
    setTyped(null);
    const target = Math.max(1, Math.min(reached, unit));
    if (target !== current) onJumpToUnit(target - 1);
  };
  const press = (key: PadKey) => {
    if (key !== "go") setTyped((t) => typeDigit(t, key));
    else if (typed) go(Number(typed));
  };

  // While the menu is open, number keys type a unit's number, Backspace and Enter edit and go
  // (above the menu's own exclusive scope, which keeps all other keys from the question)
  useKeyScope(
    ({ key }) => {
      if (/^[0-9]$/.test(key)) press(key);
      else if (typed !== null && key === "Backspace") press("back");
      else if (typed !== null && key === "Enter") press("go");
      else return false;
      return true;
    },
    true,
    { priority: PRIORITY.menu + 1 },
  );

  const questions = phase.questions ?? [];
  return (
    <div className="flex max-h-[70vh] flex-col">
      <UnitStepper
        current={current}
        reached={reached}
        total={total}
        typed={typed}
        onGo={go}
        onTogglePad={() => setTyped(typed === null ? "" : null)}
      />
      {typed !== null && <UnitNumberPad typed={typed} reached={reached} onPress={press} />}
      {typed === null && questions.length > 1 && <UnitQuestions questions={questions} onPick={onJumpToQuestion} />}
    </div>
  );
}

/** The number typed so far after a key of the pad (at most 6 digits, no leading zeros). */
function typeDigit(typed: string | null, key: PadKey): string {
  if (key === "back") return (typed ?? "").slice(0, -1);
  return ((typed ?? "") + key).replace(/^0+/, "").slice(0, 6);
}

/** The unit's questions the coder got to, to go to one. */
function UnitQuestions({
  questions,
  onPick,
}: {
  questions: NavigationUnitQuestion[];
  onPick: (index: number) => void;
}) {
  return (
    <div className="flex-1 space-y-0.5 overflow-y-auto border-t border-border/60 p-1.5">
      {questions.map((q) => (
        <button
          key={q.name}
          type="button"
          onClick={() => onPick(q.index)}
          className={rowClass(q.isCurrent)}
          title={q.label}
        >
          <StepIcon completed={q.isCompleted} current={q.isCurrent} />
          <span className="truncate">{q.label}</span>
        </button>
      ))}
    </div>
  );
}
