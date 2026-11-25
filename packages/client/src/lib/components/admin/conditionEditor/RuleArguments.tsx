import { optionLabel, type Option, type OptionValue } from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import type { RuleOperator } from "../../../design/conditionRules";
import { invalidClass, selectClass } from "./classes";

interface ArgumentsProps {
  args: OptionValue[];
  /** The values that can be picked. */
  options: Option[];
  onChange: (args: OptionValue[]) => void;
}

/** The values of a rule, entered as its operator takes them. */
export function RuleArguments({ operator, ...props }: ArgumentsProps & { operator: RuleOperator | undefined }) {
  // No operator fits: the values as they are; choosing an operator fixes the row.
  if (!operator) return <UnfitValues args={props.args} />;
  switch (operator.args) {
    case "one":
      return props.options.length > 0 ? <OneValue {...props} /> : null;
    case "several":
      return <SeveralValues {...props} />;
    case "number":
      return <Numbers count={1} {...props} />;
    case "range":
      return <Numbers count={2} {...props} />;
    case "none":
      return null;
  }
}

function UnfitValues({ args }: { args: OptionValue[] }) {
  if (args.length === 0) return null;
  return <span className="font-mono text-destructive">{args.map((a) => JSON.stringify(a)).join(", ")}</span>;
}

const isOption = (options: Option[], value: OptionValue) => options.some((o) => o.value === value);

/** One of the options; a value that isn't one stays, marked, until another is chosen. */
function OneValue({ args, options, onChange }: ArgumentsProps) {
  const current = args[0];
  const unknown = current !== undefined && !isOption(options, current);
  return (
    <select
      className={`${selectClass} ${unknown ? invalidClass : ""}`}
      value={JSON.stringify(current ?? null)}
      onChange={(e) => onChange([JSON.parse(e.target.value) as OptionValue])}
    >
      {unknown && <option value={JSON.stringify(current)}>{JSON.stringify(current)} (not an option)</option>}
      {options.map((o) => (
        <option key={String(o.value)} value={JSON.stringify(o.value)}>
          {optionLabel(o)}
        </option>
      ))}
    </select>
  );
}

/** Any number of the options, as chips; values that aren't options come first, to remove. */
function SeveralValues({ args, options, onChange }: ArgumentsProps) {
  const toggle = (value: OptionValue) =>
    onChange(args.includes(value) ? args.filter((v) => v !== value) : [...args, value]);
  const unknown = args.filter((v) => !isOption(options, v));
  return (
    <div className="flex flex-wrap gap-1">
      {unknown.map((v) => (
        <button
          key={`invalid-${JSON.stringify(v)}`}
          type="button"
          title="Not an option: click to remove"
          onClick={() => toggle(v)}
          className="rounded border border-destructive px-1.5 py-0.5 text-[11px] text-destructive line-through"
        >
          {JSON.stringify(v)}
        </button>
      ))}
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => toggle(o.value)}
          className={`rounded border px-1.5 py-0.5 text-[11px] ${chipClass(args.includes(o.value))}`}
        >
          {optionLabel(o)}
        </button>
      ))}
    </div>
  );
}

const chipClass = (chosen: boolean) =>
  chosen ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground";

/** One number, or the two of a range. */
function Numbers({ count, args, onChange }: ArgumentsProps & { count: number }) {
  const set = (index: number, text: string) => {
    const next = [...args];
    next[index] = Number(text);
    onChange(next);
  };
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: count }, (_, k) => (
        <Input
          key={k}
          type="number"
          className="h-8 w-20 text-xs"
          value={typeof args[k] === "number" ? args[k] : ""}
          onChange={(e) => set(k, e.target.value)}
        />
      ))}
    </div>
  );
}
