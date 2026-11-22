import type { AnyVariableType } from "@annotinder/contracts";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { defaultRandomOptions } from "../../../design/answerTypes";
import { OptionsEditor } from "../OptionsEditor";
import { ToggleChip } from "./ToggleChip";

type RandomVariable = Extract<AnyVariableType, { type: "random" }>;

/**
 * A random condition (a computed item): how it is drawn, whether it is
 * linked to a set column of the units (then it also selects the coder's
 * units), what a balanced draw balances within, and its values.
 */
export function RandomConditionFields({
  variable: v,
  stratifyChoices,
  setColumns,
  onChange,
}: {
  variable: RandomVariable;
  stratifyChoices: string[];
  setColumns: string[];
  onChange: (next: AnyVariableType) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-sm font-medium">
          Drawn
          <InfoTip label="About random conditions">
            Assigned when a coder reaches this item, so earlier questions can come first (coders screened out before
            don&apos;t count). Use it as <span className="font-mono">$var.name</span>. Linked to a set column of the
            units, it also selects the coder&apos;s units.
          </InfoTip>
        </label>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={v.draw}
          onChange={(e) => onChange({ ...v, draw: e.target.value as typeof v.draw })}
        >
          <option value="balanced">Balanced (the value fewest coders have)</option>
          <option value="random">Random</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-sm font-medium">
          Linked to units
          <InfoTip label="About linking to units">
            Linked to a set column, the coder&apos;s value also selects their units in the loops after this item: only
            units whose cell holds it (and <span className="font-mono">_overlap</span> units).
          </InfoTip>
        </label>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={v.units ?? ""}
          onChange={(e) => {
            const next: RandomVariable = { ...v, units: e.target.value || undefined };
            // Not linked: the values must be listed
            if (!next.units) {
              delete next.units;
              if (!next.options) next.options = defaultRandomOptions();
            }
            onChange(next);
          }}
        >
          <option value="">Not linked to units</option>
          {[...new Set([...setColumns, ...(v.units ? [v.units] : [])])].map((c) => (
            <option key={c} value={c}>
              {c}
              {setColumns.includes(c) ? "" : " (not in the units)"}
            </option>
          ))}
        </select>
        {v.units && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!v.options}
              onChange={(e) => {
                const next: RandomVariable = { ...v };
                if (e.target.checked) delete next.options;
                else next.options = defaultRandomOptions();
                onChange(next);
              }}
            />
            All values in the column (no fixed list)
          </label>
        )}
      </div>
      {v.draw === "balanced" && stratifyChoices.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Balance within groups of (optional)</label>
          <div className="flex flex-wrap gap-1">
            {[...new Set([...stratifyChoices, ...(v.stratify ?? [])])].map((name) => {
              const on = v.stratify?.includes(name) ?? false;
              return (
                <ToggleChip
                  key={name}
                  on={on}
                  onClick={() => {
                    const stratify = on ? (v.stratify ?? []).filter((n) => n !== name) : [...(v.stratify ?? []), name];
                    const next: RandomVariable = { ...v, stratify };
                    if (stratify.length === 0) delete next.stratify;
                    onChange(next);
                  }}
                >
                  {name}
                </ToggleChip>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Stratified: e.g. with gender, the options are balanced among women, and among men.
          </p>
        </div>
      )}
      {v.options && (
        <OptionsEditor
          options={v.options}
          onChange={(options) => onChange({ ...v, options })}
          extra={
            v.draw === "random"
              ? (option, update) => (
                  <Input
                    placeholder="weight"
                    type="number"
                    title="Weight of this option in the random draw (default 1)"
                    value={option.weight ?? ""}
                    onChange={(e) => update({ weight: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className="h-8 w-16 text-xs"
                  />
                )
              : undefined
          }
        />
      )}
    </>
  );
}
