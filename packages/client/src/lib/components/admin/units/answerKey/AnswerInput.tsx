import { formatAnswerKey, parseAnswerKey, type AnswerAlternative, type AnyVariableType } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AnswerKeyQuestion {
  name: string;
  variable: AnyVariableType;
}

interface Option {
  value: string;
  label: string;
}

/** The option values of a choice question; undefined for numbers and confirm. */
function optionsOf(variable: AnyVariableType): Option[] | undefined {
  if (!("options" in variable) || !Array.isArray(variable.options)) return undefined;
  return (variable.options as { value: unknown; label?: string }[]).map((o) => ({
    value: String(o.value),
    label: o.label ?? String(o.value),
  }));
}

interface AnswerInputProps {
  question: AnswerKeyQuestion;
  cell: string;
  onChange: (cell: string) => void;
}

/** One question's right answer: option chips, a range or a checkbox, plus the cell as text. */
export function AnswerInput({ question, cell, onChange }: AnswerInputProps) {
  const key = parseAnswerKey(cell) ?? [];
  const options = optionsOf(question.variable);
  const multiple = question.variable.type === "nominal" && question.variable.multiple === true;
  return (
    <div className="flex flex-col gap-1.5">
      {options && <OptionChips options={options} multiple={multiple} answerKey={key} onChange={onChange} />}
      {!options && question.variable.type === "numeric" && (
        <RangeInputs name={question.name} answerKey={key} onChange={onChange} />
      )}
      {!options && question.variable.type === "confirm" && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={cell.trim() === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
          />{" "}
          Confirmed is right
        </label>
      )}
      <Input
        aria-label={`${question.name}: cell`}
        className="h-7 font-mono text-xs"
        value={cell}
        placeholder="empty: not checked"
        onChange={(e) => onChange(e.target.value)}
      />
      {options && !multiple && key.length > 1 && (
        <span className="text-[11px] text-muted-foreground">Any of these is right.</span>
      )}
    </div>
  );
}

/** The cell of the chosen options. One answer: each is an alternative (any is right). Several answers: together, one alternative. */
function optionsCell(chosen: string[], multiple: boolean): string {
  if (chosen.length === 0) return formatAnswerKey([]);
  const alternatives: AnswerAlternative[] = multiple ? [{ values: chosen }] : chosen.map((v) => ({ values: [v] }));
  return formatAnswerKey(alternatives);
}

/** A choice question's right options, as chips to toggle. */
function OptionChips({
  options,
  multiple,
  answerKey,
  onChange,
}: {
  options: Option[];
  multiple: boolean;
  answerKey: AnswerAlternative[];
  onChange: (cell: string) => void;
}) {
  const chosen = new Set(answerKey.flatMap((alt) => ("values" in alt ? alt.values : [])));
  const toggle = (value: string) => {
    const next = options.map((o) => o.value).filter((v) => (v === value ? !chosen.has(v) : chosen.has(v)));
    onChange(optionsCell(next, multiple));
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={chosen.has(o.value) ? "default" : "outline"}
          aria-pressed={chosen.has(o.value)}
          onClick={() => toggle(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/** The bounds of a numeric right answer: one number (exactly), or from and to. */
function rangeOf(alternative: AnswerAlternative | undefined): [string, string] {
  if (!alternative) return ["", ""];
  if ("range" in alternative) return [String(alternative.range[0]), String(alternative.range[1])];
  return [alternative.values[0] ?? "", ""];
}

/** The cell of a numeric right answer. */
function rangeCell(from: string, to: string): string {
  if (from === "") return "";
  return to === "" ? from : `${from}..${to}`;
}

/** A numeric question's right answer: a number, or a range. */
function RangeInputs({
  name,
  answerKey,
  onChange,
}: {
  name: string;
  answerKey: AnswerAlternative[];
  onChange: (cell: string) => void;
}) {
  const [from, to] = rangeOf(answerKey[0]);
  return (
    <div className="flex items-center gap-2 text-xs">
      <Input
        type="number"
        aria-label={`${name}: right answer`}
        className="h-8 w-24"
        value={from}
        onChange={(e) => onChange(rangeCell(e.target.value, to))}
      />
      to
      <Input
        type="number"
        aria-label={`${name}: up to`}
        className="h-8 w-24"
        placeholder="(exactly)"
        value={to}
        onChange={(e) => onChange(rangeCell(from, e.target.value))}
      />
    </div>
  );
}
