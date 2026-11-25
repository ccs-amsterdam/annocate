import { useState } from "react";
import type { Option, OptionsFrom } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { useDeployedOptionValues } from "../../design/deployedValues";
import { NumericCodesHelp } from "./optionsEditor/NumericCodesHelp";
import { OptionRow } from "./optionsEditor/OptionRow";
import { OptionsFromRow, OptionsFromSelect, type OptionSource } from "./optionsEditor/OptionsFromRow";
import { isRising, isSequence, labelPatch, moveOption, newOptionValue, renumber } from "./optionsEditor/optionValues";
import { useSwapAnimation } from "./optionsEditor/useSwapAnimation";

export type { OptionSource };

export interface OptionsEditorProps<T extends Option> {
  options: T[];
  onChange: (options: T[]) => void;
  /** Ordinal: numeric values rising in option order. Default nominal: string values derived from the labels. */
  level?: "nominal" | "ordinal";
  max?: number;
  /** Swipe options: shows the direction of each (1st left, 2nd right, 3rd up). */
  swipe?: boolean;
  /** Extra columns per option, e.g. the weight of a random condition's option. */
  extra?: (option: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  /** Options from data (category questions): one fixed row among the options, where they go. */
  from?: OptionsFrom;
  /** What options from data can come from. */
  sources?: OptionSource[];
  onFrom?: (from: OptionsFrom | undefined) => void;
}

/**
 * The options of a question (docs/client.md §7): a label the coder sees and
 * the value that is stored. For nominal questions the value follows the
 * label (`Human interest` -> `human_interest`) until it is edited by hand,
 * or once it is in the deployed design (coders may have given it).
 * Ordinal values are 1..n in option order, renumbered when options are
 * added, removed or moved; with "Custom values" they are set by hand (any
 * numbers rising in order). Custom isn't stored: options that aren't 1..n
 * open as custom.
 */
export function OptionsEditor<T extends Option>({
  options,
  onChange,
  level = "nominal",
  max,
  swipe,
  extra,
  from,
  sources = [],
  onFrom,
}: OptionsEditorProps<T>) {
  const ordinal = level === "ordinal";
  const [custom, setCustom] = useState(() => ordinal && !isSequence(options));
  const deployed = useDeployedOptionValues();
  const valuesFollowOrder = ordinal && !custom;
  const { grid, swapped } = useSwapAnimation(options);
  // The options from data row: before option `fromAt` (none: after the last)
  const fromAt = from ? Math.min(from.at ?? options.length, options.length) : -1;

  /** Changes to the list of options: renumbered while values follow the order. */
  const commit = (next: T[]) => onChange(valuesFollowOrder ? renumber(next) : next);
  const update = (index: number, patch: Partial<T>) =>
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const setLabel = (index: number, label: string) => {
    const option = options[index];
    const followLabel = !ordinal && !deployed.has(String(option.value));
    update(index, labelPatch(option, label, followLabel) as Partial<T>);
  };
  const move = (index: number, by: number) => {
    swapped(index + by, index);
    commit(moveOption(options, index, by));
  };
  const remove = (index: number) => {
    if (from && index < fromAt) onFrom?.({ ...from, at: fromAt - 1 });
    commit(options.filter((_, i) => i !== index));
  };
  const add = () => commit([...options, { value: newOptionValue(options, ordinal) } as T]);
  const setCustomValues = (on: boolean) => {
    setCustom(on);
    // Back to values that follow the order.
    if (!on) onChange(renumber(options));
  };

  const fromRow = from && (
    <OptionsFromRow
      from={from}
      at={fromAt}
      count={options.length}
      onPlace={(at) => onFrom?.(at >= options.length ? { from: from.from } : { ...from, at })}
      onRemove={() => onFrom?.(undefined)}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Options</label>
        {ordinal ? <CustomValuesToggle checked={custom} onChange={setCustomValues} /> : <NumericCodesHelp />}
      </div>
      <div
        ref={grid}
        className="grid grid-cols-[auto_1fr_8rem_auto_auto] items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <ColumnHeaders />
        {options.map((option, i) => (
          <div key={i} className="contents">
            {i === fromAt && fromRow}
            <OptionRow
              option={option}
              index={i}
              last={i === options.length - 1}
              swipe={swipe}
              ordinal={ordinal}
              valuesFollowOrder={valuesFollowOrder}
              extra={extra?.(option, (patch) => update(i, patch))}
              onLabel={(label) => setLabel(i, label)}
              onPatch={(patch) => update(i, patch)}
              onMove={(by) => move(i, by)}
              onRemove={() => remove(i)}
            />
          </div>
        ))}
        {fromAt === options.length && fromRow}
      </div>
      {ordinal && !isRising(options) && (
        <p className="text-[11px] text-destructive">Ordinal values must rise in the order of the options.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(!max || options.length < max) && (
          <Button type="button" variant="outline" size="sm" onClick={add}>
            + Add option
          </Button>
        )}
        {onFrom && !from && sources.length > 0 && (
          <OptionsFromSelect sources={sources} onPick={(source) => onFrom({ from: source })} />
        )}
      </div>
    </div>
  );
}

function ColumnHeaders() {
  return (
    <>
      <span />
      <span>Label (shown)</span>
      <span>Value (stored)</span>
      <span>Color</span>
      <span />
    </>
  );
}

/** Ordinal options: set the values by hand instead of 1..n. */
function CustomValuesToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Custom values
    </label>
  );
}
