import { cn } from "cn";
import {
  DISTRIBUTIONS,
  columnValues,
  defaultDistribution,
  distributionProblems,
  distributionSets,
  overlapCount,
  type SetupDistribution,
  type SetupOverlap,
} from "../../../admin/setupRecipe";
import { HelpButton } from "../../../help/HelpButton";
import { SharedSettings } from "../unitLoop/UnitsEditor";
import type { StepProps } from "./common";

const numberInput = "h-7 w-16 rounded-md border border-input bg-background px-1.5 text-xs";
const smallSelect = "h-7 rounded-md border border-input bg-background px-1 text-xs";

/** Who codes which units: everyone, sets, a crowd, or a group per condition; with overlap units. */
export function DistributionStep({ answers, set }: StepProps) {
  const d = answers.distribution;
  const columns = (answers.units?.fields ?? []).map((f) => f.name);
  const choose = (mode: SetupDistribution["mode"]) => set({ distribution: defaultDistribution(mode, columns) });
  const update = (patch: Partial<SetupDistribution>) => set({ distribution: { ...d, ...patch } as SetupDistribution });
  const options = DISTRIBUTIONS.filter((o) => o.mode !== "groups" || answers.parts.experiment);
  const problems = distributionProblems(answers);
  const { sets, overlap } = distributionSets(d, answers.units);
  return (
    <>
      <label className="block text-xs font-medium text-muted-foreground">
        Who codes which units
        <select
          className="mt-1 block h-9 w-full max-w-sm rounded-md border border-input bg-background px-2 text-sm"
          value={d.mode}
          onChange={(e) => choose(e.target.value as SetupDistribution["mode"])}
        >
          {options.map((o) => (
            <option key={o.mode} value={o.mode}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">{DISTRIBUTIONS.find((o) => o.mode === d.mode)!.help}</p>

      <div className="space-y-3 text-sm">
        {d.mode === "sets" && (
          <>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-muted-foreground">The sets</legend>
              <label className="flex flex-wrap items-center gap-2">
                <input type="radio" checked={d.source === "split"} onChange={() => update({ source: "split" })} />
                Divide the units into
                <input
                  aria-label="Number of sets"
                  type="number"
                  min={1}
                  className={numberInput}
                  value={d.sets}
                  onChange={(e) => update({ sets: Number(e.target.value) })}
                />
                sets
              </label>
              <label
                className={cn("flex flex-wrap items-center gap-2", columns.length === 0 && "text-muted-foreground")}
              >
                <input
                  type="radio"
                  disabled={columns.length === 0}
                  checked={d.source === "column"}
                  onChange={() => update({ source: "column" })}
                />
                One set per value of the column
                <select
                  aria-label="Column with the set"
                  disabled={columns.length === 0}
                  className={smallSelect}
                  value={d.column}
                  onChange={(e) => update({ source: "column", column: e.target.value })}
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <OverlapInput
              overlap={d.overlap}
              units={answers.units?.units.length ?? 0}
              onChange={(overlap) => update({ overlap })}
            />
            <p className="text-xs text-muted-foreground">
              Each set is a coder&apos;s: deploying makes a link per coder. You can rename the coders (or use their
              email addresses) on the Units page.
            </p>
            {answers.units && sets.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {sets.map((s) => `${s.name}: ${s.units.length}`).join(", ")}
                {overlap.length > 0 && `; overlap: ${overlap.length} units every coder codes`}
              </p>
            )}
          </>
        )}

        {d.mode === "crowd" && (
          <>
            <SharedSettings
              criteria={d.shared}
              agreeable={[]}
              allowAgreement={false}
              onChange={(shared) => update({ shared })}
            />
            <p className="text-xs text-muted-foreground">
              Coding until coders agree on a question is set in the editor, once the question has its answer type.{" "}
              <HelpButton topic="setup-wizard">What only the editor does</HelpButton>
            </p>
            <OverlapInput
              overlap={d.overlap}
              units={answers.units?.units.length ?? 0}
              onChange={(overlap) => update({ overlap })}
            />
          </>
        )}

        {d.mode === "groups" && (
          <>
            <label className="flex flex-wrap items-center gap-2">
              The units of each condition, by the column
              <select
                aria-label="Column for the groups"
                className={smallSelect}
                value={d.column}
                onChange={(e) => update({ column: e.target.value, values: {} })}
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              {answers.experiment.conditions
                .filter((c) => c.trim())
                .map((condition) => (
                  <fieldset key={condition} className="rounded-md border border-border p-2">
                    <legend className="px-1 text-xs font-medium">{condition}</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {columnValues(answers.units, d.column).map((value) => {
                        const chosen = d.values[condition] ?? [];
                        return (
                          <label key={value} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={chosen.includes(value)}
                              onChange={(e) =>
                                update({
                                  values: {
                                    ...d.values,
                                    [condition]: e.target.checked
                                      ? [...chosen, value]
                                      : chosen.filter((v) => v !== value),
                                  },
                                })
                              }
                            />
                            {value || "(empty)"}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
            </div>
          </>
        )}
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Overlap units (test units every coder codes): none, or a number of units. */
function OverlapInput({
  overlap,
  units,
  onChange,
}: {
  overlap: SetupOverlap;
  units: number;
  onChange: (overlap: SetupOverlap) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={overlap !== null}
          onChange={(e) => onChange(e.target.checked ? Math.max(1, Math.round(units / 10)) : null)}
        />
        Overlap: units every coder codes (to compare coders)
      </label>
      {overlap !== null && (
        <>
          <input
            aria-label="Overlap size"
            type="number"
            min={1}
            max={units || undefined}
            className={numberInput}
            value={overlap}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          units
          {units > 0 && overlapCount(overlap, units) < overlap && (
            <span className="text-xs text-muted-foreground">(at most {units})</span>
          )}
        </>
      )}
    </div>
  );
}
