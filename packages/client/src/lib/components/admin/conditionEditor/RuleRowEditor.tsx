import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  argsForOperator,
  defaultRow,
  findTarget,
  rawOperatorLabel,
  rowProblems,
  ruleOperators,
  ruleValueOptions,
  type RuleOperator,
  type RuleRow,
  type RuleTarget,
} from "../../../design/conditionRules";
import { invalidClass, selectClass } from "./classes";
import { RuleArguments } from "./RuleArguments";

/** A rule target as one select value: `question` or `question.item`. */
const targetKey = (t: { question: string; item?: string }) => (t.item ? `${t.question}.${t.item}` : t.question);

/** One rule: a question (or scale item), an operator and its values, with its problems below. */
export function RuleRowEditor({
  label,
  row,
  targets,
  onChange,
  onRemove,
}: {
  label: string;
  row: RuleRow;
  targets: RuleTarget[];
  onChange: (row: RuleRow) => void;
  onRemove: () => void;
}) {
  const target = findTarget(targets, row);
  const operators = target ? ruleOperators(target) : [];
  const operator = operators.find((o) => o.key === row.operator);
  const options = ruleValueOptions(target, operator);
  const setOperator = (next: RuleOperator) =>
    onChange({ ...row, operator: next.key, args: argsForOperator(next, row.args, options) });

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="w-6 text-muted-foreground">{label}</span>
        <TargetSelect row={row} target={target} targets={targets} onPick={(next) => onChange(defaultRow(next))} />
        <OperatorSelect row={row} operator={operator} operators={operators} onPick={setOperator} />
        <RuleArguments
          operator={operator}
          args={row.args}
          options={options}
          onChange={(args) => onChange({ ...row, args })}
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove rule">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {rowProblems(row, targets).map((problem) => (
        <p key={problem} className="pl-8 text-xs text-destructive">
          {problem}
        </p>
      ))}
    </div>
  );
}

/** The question (or scale item) the rule is about; one that isn't available stays, marked. */
function TargetSelect({
  row,
  target,
  targets,
  onPick,
}: {
  row: RuleRow;
  target: RuleTarget | undefined;
  targets: RuleTarget[];
  onPick: (target: RuleTarget) => void;
}) {
  const pick = (key: string) => {
    const next = targets.find((t) => targetKey(t) === key);
    if (next) onPick(next);
  };
  return (
    <select
      className={`${selectClass} font-mono ${target ? "" : invalidClass}`}
      value={targetKey(row)}
      onChange={(e) => pick(e.target.value)}
    >
      {!target && <option value={targetKey(row)}>{targetKey(row)} (not available)</option>}
      {targets.map((t) => (
        <option key={targetKey(t)} value={targetKey(t)}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

/** The rule's operator; one that doesn't fit the question stays, marked. */
function OperatorSelect({
  row,
  operator,
  operators,
  onPick,
}: {
  row: RuleRow;
  operator: RuleOperator | undefined;
  operators: RuleOperator[];
  onPick: (operator: RuleOperator) => void;
}) {
  return (
    <select
      className={`${selectClass} ${operator ? "" : invalidClass}`}
      value={row.operator}
      onChange={(e) => onPick(operators.find((o) => o.key === e.target.value)!)}
    >
      {!operator && <option value="">{rawOperatorLabel(row)}</option>}
      {operators.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
