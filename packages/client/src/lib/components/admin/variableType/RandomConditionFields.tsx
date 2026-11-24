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

interface FieldsProps {
  variable: RandomVariable;
  experiment: ExperimentContext;
  onChange: (next: AnyVariableType) => void;
}

/** A URL parameter's values as the conditions (the labels the conditions have are kept). */
function paramOptions(v: RandomVariable, param: UrlParam | undefined) {
  return (param?.values ?? []).map((pv) => {
    const old = v.options?.find((o) => String(o.value) === pv.value);
    return { value: pv.value, ...(old?.label ? { label: old.label } : pv.label ? { label: pv.label } : {}) };
  });
}

/** The conditions to list when they must be: the URL parameter's values, else two to start with. */
function listedOptions(v: RandomVariable, experiment: ExperimentContext) {
  const param = experiment.urlParams.find((p) => p.name === v.param);
  return param?.values?.length ? paramOptions(v, param) : defaultRandomOptions();
}

/** The variable taking its condition from a URL parameter (none: `param` removed): its values are the conditions. */
function withParam(v: RandomVariable, name: string | undefined, experiment: ExperimentContext): RandomVariable {
  const next: RandomVariable = { ...v, param: name };
  if (!name) delete next.param;
  const chosen = experiment.urlParams.find((p) => p.name === name);
  if (next.options && chosen?.values?.length) next.options = paramOptions(v, chosen);
  return next;
}

/** The variable assigned another way: what only the other ways have is removed. */
function withDraw(v: RandomVariable, draw: RandomVariable["draw"], experiment: ExperimentContext): RandomVariable {
  const next: RandomVariable = { ...v, draw };
  if (draw === "url_param") {
    // The parameter it had, else the first that lists values (none: to choose)
    const withValues = experiment.urlParams.filter((p) => p.values && p.values.length > 0);
    next.param = v.param ?? withValues[0]?.name ?? "";
    const chosen = experiment.urlParams.find((p) => p.name === next.param);
    if (next.options && chosen?.values?.length) next.options = paramOptions(v, chosen);
  } else delete next.param;
  if (draw !== "balanced") delete next.stratify;
  return next;
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
  const fields = { variable: v, experiment, onChange };
  return (
    <>
      <AssignedSelect {...fields} />
      {v.draw === "url_param" && <ParamSelect {...fields} />}
      <ConditionUnitsFields {...fields} />
      {v.draw === "balanced" && stratifyChoices.length > 0 && (
        <StratifyFields variable={v} choices={stratifyChoices} onChange={onChange} />
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

/** How coders get their condition: at random, balanced, or from a URL parameter. */
function AssignedSelect({ variable: v, experiment, onChange }: FieldsProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1 text-sm font-medium">
        Assigned
        <InfoTip label="About experiments">
          Assigned when a coder reaches this item, so earlier questions can come first (coders screened out before
          don&apos;t count). Use it as <span className="font-mono">$var.name</span>. From a URL parameter: the condition
          is the link&apos;s value of it (e.g. set by a panel), nothing is drawn.
        </InfoTip>
      </label>
      <select
        aria-label="Assigned"
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={v.draw}
        onChange={(e) => onChange(withDraw(v, e.target.value as RandomVariable["draw"], experiment))}
      >
        <option value="random">At random</option>
        <option value="balanced">Balanced (the value fewest coders have)</option>
        <option value="url_param">From a URL parameter</option>
      </select>
    </div>
  );
}

/** What to do about the URL parameters, given the ones there are and the one chosen. */
function paramHint(withValues: UrlParam[], param: UrlParam | undefined): string {
  if (withValues.length === 0)
    return "Add a URL parameter with a list of values (the conditions) in the Study entry's URL parameters.";
  if (param && !param.values?.length)
    return "This parameter lists no values: list the conditions as its values in the Study entry.";
  return "The parameter's values are the conditions.";
}

/** The URL parameter whose value is the coder's condition. */
function ParamSelect({ variable: v, experiment, onChange }: FieldsProps) {
  const withValues = experiment.urlParams.filter((p) => p.values && p.values.length > 0);
  const param = experiment.urlParams.find((p) => p.name === v.param);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor="experiment-param">
        URL parameter
      </label>
      <select
        id="experiment-param"
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={v.param ?? ""}
        onChange={(e) => onChange(withParam(v, e.target.value || undefined, experiment))}
      >
        {!param && <option value={v.param ?? ""}>{v.param ? `${v.param} (no such parameter)` : "(choose)"}</option>}
        {withValues.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name} ({(p.values ?? []).map((pv) => pv.value).join(", ")})
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{paramHint(withValues, param)}</p>
    </div>
  );
}

/** Whether each condition gets its own units (the units' `condition_set`), and then whether its values are the conditions. */
function ConditionUnitsFields({ variable: v, experiment, onChange }: FieldsProps) {
  const conditionSet = experiment.groups.find((g) => g.name === CONDITION_SET);
  const setUnits = (units: boolean) => {
    const next: RandomVariable = { ...v, units: true };
    if (!units) {
      delete next.units;
      // Without units the values must be listed
      if (!next.options) next.options = listedOptions(v, experiment);
    }
    onChange(next);
  };
  const setFromSet = (fromSet: boolean) => {
    const next: RandomVariable = { ...v };
    if (fromSet) delete next.options;
    else next.options = listedOptions(v, experiment);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={v.units === true} onChange={(e) => setUnits(e.target.checked)} />
        Each condition gets its own units (condition_set)
        <InfoTip label="About conditions with units">
          The coder&apos;s condition also selects their units in the loops after this item: only units with it in the
          units&apos; <span className="font-mono">condition_set</span> (and test units). One experiment at most selects
          units, and only with one link (not with expert coders).
        </InfoTip>
      </label>
      {v.units === true && conditionSet && (
        <>
          <p className="text-xs text-muted-foreground">
            condition_set has {conditionSet.sets.map((s) => `${s.name} (${s.unitIds.length})`).join(", ")}.
          </p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!v.options} onChange={(e) => setFromSet(e.target.checked)} />
            The conditions are condition_set&apos;s values (no fixed list)
          </label>
        </>
      )}
      {v.units === true && !conditionSet && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-amber-700 dark:text-amber-400">The units have no condition set yet.</span>
          {experiment.client && (
            <MakeSetColumnButton client={experiment.client} column={CONDITION_SET} groups={experiment.groups}>
              Make a condition set…
            </MakeSetColumnButton>
          )}
        </div>
      )}
    </div>
  );
}

/** What a balanced draw balances within: earlier questions and session values. */
function StratifyFields({
  variable: v,
  choices,
  onChange,
}: {
  variable: RandomVariable;
  choices: string[];
  onChange: (next: AnyVariableType) => void;
}) {
  const chosen = v.stratify ?? [];
  const toggle = (name: string) => {
    const stratify = chosen.includes(name) ? chosen.filter((n) => n !== name) : [...chosen, name];
    const next: RandomVariable = { ...v, stratify };
    if (stratify.length === 0) delete next.stratify;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Balance within groups of (optional)</label>
      <div className="flex flex-wrap gap-1">
        {[...new Set([...choices, ...chosen])].map((name) => (
          <ToggleChip key={name} on={chosen.includes(name)} onClick={() => toggle(name)}>
            {name}
          </ToggleChip>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Stratified: e.g. with gender, the options are balanced among women, and among men.
      </p>
    </div>
  );
}
