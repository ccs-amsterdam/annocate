import { CONDITION_SET, type AnyVariableType, type SetGroupResponse, type UrlParam } from "@annotinder/contracts";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { defaultRandomOptions } from "../../../design/answerTypes";
import { OptionsEditor } from "../OptionsEditor";
import { MakeSetColumnButton } from "../units/SplitIntoSets";
import { ToggleChip } from "./ToggleChip";

type RandomVariable = Extract<AnyVariableType, { type: "random" }>;

/** What an experiment's form needs of the study: the units' role columns, the Study entry's URL parameters. */
export interface ExperimentContext {
  groups: SetGroupResponse[];
  urlParams: UrlParam[];
  /** To make a condition set (absent: not offered). */
  client?: ResearcherApi;
}

/**
 * An experiment's conditions: how they are assigned (at random, balanced,
 * or a URL parameter's value), whether each condition gets its own units
 * (`units`: the units' `condition_set`), what a balanced draw balances
 * within, and its values.
 */
export function RandomConditionFields({
  variable: v,
  stratifyChoices,
  experiment = { groups: [], urlParams: [] },
  onChange,
}: {
  variable: RandomVariable;
  stratifyChoices: string[];
  experiment?: ExperimentContext;
  onChange: (next: AnyVariableType) => void;
}) {
  const withValues = experiment.urlParams.filter((p) => p.values && p.values.length > 0);
  const param = experiment.urlParams.find((p) => p.name === v.param);
  const conditionSet = experiment.groups.find((g) => g.name === CONDITION_SET);
  /** A URL parameter's values as the conditions (labels kept). */
  const paramOptions = (p: UrlParam | undefined) =>
    (p?.values ?? []).map((pv) => {
      const old = v.options?.find((o) => String(o.value) === pv.value);
      return { value: pv.value, ...(old?.label ? { label: old.label } : pv.label ? { label: pv.label } : {}) };
    });
  const setParam = (name: string | undefined) => {
    const next: RandomVariable = { ...v, param: name };
    if (!name) delete next.param;
    const chosen = experiment.urlParams.find((p) => p.name === name);
    // The conditions are the parameter's values
    if (next.options && chosen?.values?.length) next.options = paramOptions(chosen);
    onChange(next);
  };
  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-sm font-medium">
          Assigned
          <InfoTip label="About experiments">
            Assigned when a coder reaches this item, so earlier questions can come first (coders screened out before
            don&apos;t count). Use it as <span className="font-mono">$var.name</span>. From a URL parameter: the
            condition is the link&apos;s value of it (e.g. set by a panel), nothing is drawn.
          </InfoTip>
        </label>
        <select
          aria-label="Assigned"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={v.draw}
          onChange={(e) => {
            const draw = e.target.value as RandomVariable["draw"];
            const next: RandomVariable = { ...v, draw };
            if (draw === "url_param") {
              next.param = v.param ?? withValues[0]?.name ?? "";
              const chosen = experiment.urlParams.find((p) => p.name === next.param);
              if (next.options && chosen?.values?.length) next.options = paramOptions(chosen);
            } else delete next.param;
            if (draw !== "balanced") delete next.stratify;
            onChange(next);
          }}
        >
          <option value="random">At random</option>
          <option value="balanced">Balanced (the value fewest coders have)</option>
          <option value="url_param">From a URL parameter</option>
        </select>
      </div>
      {v.draw === "url_param" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="experiment-param">
            URL parameter
          </label>
          <select
            id="experiment-param"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={v.param ?? ""}
            onChange={(e) => setParam(e.target.value || undefined)}
          >
            {!param && <option value={v.param ?? ""}>{v.param ? `${v.param} (no such parameter)` : "(choose)"}</option>}
            {withValues.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({(p.values ?? []).map((pv) => pv.value).join(", ")})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {withValues.length === 0
              ? "Add a URL parameter with a list of values (the conditions) in the Study entry's URL parameters."
              : param && !param.values?.length
                ? "This parameter lists no values: list the conditions as its values in the Study entry."
                : "The parameter's values are the conditions."}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={v.units === true}
            onChange={(e) => {
              const next: RandomVariable = { ...v, units: true };
              if (!e.target.checked) {
                delete next.units;
                // Without units the values must be listed
                if (!next.options) next.options = param?.values?.length ? paramOptions(param) : defaultRandomOptions();
              }
              onChange(next);
            }}
          />
          Each condition gets its own units (condition_set)
          <InfoTip label="About conditions with units">
            The coder&apos;s condition also selects their units in the loops after this item: only units with it in
            the units&apos; <span className="font-mono">condition_set</span> (and test units). One experiment at most
            selects units, and only with one link (not with specific coders).
          </InfoTip>
        </label>
        {v.units === true &&
          (conditionSet ? (
            <>
              <p className="text-xs text-muted-foreground">
                condition_set has {conditionSet.sets.map((s) => `${s.name} (${s.unitIds.length})`).join(", ")}.
              </p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!v.options}
                  onChange={(e) => {
                    const next: RandomVariable = { ...v };
                    if (e.target.checked) delete next.options;
                    else next.options = param?.values?.length ? paramOptions(param) : defaultRandomOptions();
                    onChange(next);
                  }}
                />
                The conditions are condition_set&apos;s values (no fixed list)
              </label>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-amber-700 dark:text-amber-400">The units have no condition set yet.</span>
              {experiment.client && (
                <MakeSetColumnButton client={experiment.client} column={CONDITION_SET} groups={experiment.groups}>
                  Make a condition set…
                </MakeSetColumnButton>
              )}
            </div>
          ))}
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
