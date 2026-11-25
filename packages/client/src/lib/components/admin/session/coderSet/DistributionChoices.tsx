import { TEST_SET_TYPES, type TestSetType } from "@annotinder/contracts";
import type { CoderSetChoices } from "../../../../admin/coderSet";
import { TEST_LABELS } from "../../../../admin/setKinds";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";

/** A change to the dialog's choices. */
type Change = (patch: Partial<CoderSetChoices>) => void;

/** How the units go to the coders: divided (each unit to a number of coders), or all to everyone. */
export function PerUnitChoice({ choices, onChange }: { choices: CoderSetChoices; onChange: Change }) {
  return (
    <div className="flex flex-col gap-1 text-xs font-semibold">
      Coders per unit
      <div className="flex items-center gap-2">
        <select
          aria-label="How the units go to coders"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal"
          value={choices.everyone ? "everyone" : "divide"}
          onChange={(e) => onChange({ everyone: e.target.value === "everyone" })}
        >
          <option value="divide">Divide the units</option>
          <option value="everyone">Everyone codes everything</option>
        </select>
        {!choices.everyone && (
          <Input
            type="number"
            aria-label="Coders per unit"
            min={1}
            max={Math.max(1, choices.coders.length)}
            className="h-8 w-20 text-xs font-normal"
            value={choices.perUnit}
            onChange={(e) => onChange({ perUnit: Math.max(1, Number(e.target.value)) })}
          />
        )}
      </div>
    </div>
  );
}

/** The test units: kept as they are, or this many of each type drawn anew. */
export function TestUnitsChoice({
  choices,
  current,
  onChange,
}: {
  choices: CoderSetChoices;
  /** The test units the draft has, per type. */
  current: Record<TestSetType, number>;
  onChange: Change;
}) {
  const shown = choices.redistribute ? choices.testCounts : current;
  const hasTests = TEST_SET_TYPES.some((t) => current[t] > 0);
  const setCount = (type: TestSetType, value: string) =>
    onChange({ testCounts: { ...choices.testCounts, [type]: Math.max(0, Math.floor(Number(value))) } });
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-3">
      <h3 className="flex items-center gap-1 text-xs font-semibold">
        Test units
        <InfoTip label="About test units">
          Units every coder gets, besides their own (the units&apos; <span className="font-mono">test_set</span>).
          Overlap units are for comparing coders (agreement). Practice and gold units are meant to train or test coders
          on the &quot;correct&quot; answers for these units: practice units give feedback, gold units are checked
          without coders noticing.
        </InfoTip>
      </h3>
      {TEST_SET_TYPES.map((type) => (
        <label key={type} className="flex items-center gap-2 text-xs">
          <span className="w-32 font-semibold">{TEST_LABELS[type]}</span>
          <Input
            type="number"
            aria-label={TEST_LABELS[type]}
            min={0}
            disabled={!choices.redistribute}
            className="h-8 w-20 text-xs"
            value={shown[type]}
            onChange={(e) => setCount(type, e.target.value)}
          />
          units
        </label>
      ))}
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={choices.redistribute}
          onChange={(e) => onChange({ redistribute: e.target.checked, testCounts: current })}
        />
        <span>
          Redistribute test units
          <span className="block text-muted-foreground">{redistributeText(choices.redistribute, hasTests)}</span>
        </span>
      </label>
      {choices.redistribute && choices.testCounts.practice + choices.testCounts.gold > 0 && <AnswerColumnsNote />}
    </section>
  );
}

function redistributeText(redistribute: boolean, hasTests: boolean): string {
  if (redistribute) return "Draws this many units of each type anew (at random), replacing the current test units.";
  return hasTests
    ? "The current test units stay; the coders divide the other units."
    : "No test units yet: switch this on to draw some.";
}

function AnswerColumnsNote() {
  return (
    <p className="rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300">
      Practice and gold units need their correct answers: for each question to check, a column of the units named{" "}
      <span className="font-mono">answer_&lt;question&gt;</span>. Add them to your units file and upload it again, or
      write them in the unit loop&apos;s Units settings (Create gold values). Then choose the questions to check there.
    </p>
  );
}

/** Whether coders keep the units they coded when the units are divided anew. */
export function KeepCodedChoice({
  choices,
  coded,
  kept,
  onChange,
}: {
  choices: CoderSetChoices;
  /** Per selected coder who coded units, those units. */
  coded: ReadonlyMap<string, readonly number[]>;
  /** How many unit assignments the plan keeps. */
  kept: number;
  onChange: Change;
}) {
  const units = [...coded.values()].reduce((n, u) => n + u.length, 0);
  return (
    <label className="flex items-start gap-2 text-xs">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={choices.keep}
        onChange={(e) => onChange({ keep: e.target.checked })}
      />
      <span>
        Keep the units coders already coded ({units} units, by {coded.size} of these coders)
        <span className="block text-muted-foreground">
          A coder who already coded units keeps those, so nobody loses work or codes a unit twice; the rest is divided
          as usual.
          {choices.keep && kept > 0 ? ` ${kept} unit assignments are kept.` : ""}
        </span>
      </span>
    </label>
  );
}
