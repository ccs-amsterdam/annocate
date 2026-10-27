import { useEffect, useMemo, useState } from "react";
import { Code2, ListFilter, Plus, Trash2 } from "lucide-react";
import {
  KIND_METHODS,
  optionLabel,
  parseSimpleCondition,
  questionKind,
  referenceOptions,
  type AnyVariableType,
  type CodebookValidationIssue,
  type Condition,
  type OptionValue,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { scriptSyntaxError } from "../../codebook/expression";
import {
  conditionToRows,
  defaultRow,
  findTarget,
  rowsToScript,
  ruleOperators,
  ruleTargets,
  type RuleRow,
  type RuleRows,
  type RuleTarget,
} from "../../codebook/conditionRules";
import { SegmentedToggle } from "./codebookEditor/SegmentedToggle";
import { IssueList } from "./IssueList";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

type Mode = "rules" | "script";

export interface ConditionEditorProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  /** The questions a reference may use here (contracts `availableQuestions`). */
  questions: { name: string; variable: AnyVariableType }[];
  /** Inside a unit loop: `$unit` fields and these `$const` constants can be used too. */
  loop?: { constants: string[] } | null;
  /** Validation issues of this condition (errors and warnings). */
  issues?: CodebookValidationIssue[];
}

/**
 * Edits a condition (docs/client.md "References and conditions"). A
 * condition is a script; the rules mode reads and writes the simple ones
 * (rows of helper calls, all joined by "and" or all by "or"). Anything else
 * is edited as a script, which uses the same helpers.
 */
export function ConditionEditor({ condition, onChange, questions, loop, issues = [] }: ConditionEditorProps) {
  const targets = useMemo(() => ruleTargets(questions), [questions]);
  const rules = useMemo(() => {
    const simple = condition.script.trim() === "" ? { op: "const" as const, value: true } : parseSimpleCondition(condition.script);
    return simple ? conditionToRows(simple, targets) : null;
  }, [condition.script, targets]);
  const [mode, setMode] = useState<Mode>(rules ? "rules" : "script");
  const shown: Mode = rules ? mode : "script";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SegmentedToggle
          value={shown}
          onChange={(next) => {
            if (next === "rules" && !rules) {
              window.alert("This script isn't a list of simple rules; edit it as a script, or clear it to start over.");
              return;
            }
            setMode(next);
          }}
          options={[
            { value: "rules", label: "Rules", icon: ListFilter },
            { value: "script", label: "Script", icon: Code2 },
          ]}
        />
        {shown === "rules" && rules && rules.rows.length > 1 && (
          <select
            className={selectClass}
            value={rules.match}
            onChange={(e) => onChange({ script: rowsToScript({ ...rules, match: e.target.value as "all" | "any" }, targets) })}
          >
            <option value="all">All rules must hold</option>
            <option value="any">Any rule may hold</option>
          </select>
        )}
      </div>

      {shown === "rules" && rules ? (
        <RulesEditor rules={rules} targets={targets} onChange={(next) => onChange({ script: rowsToScript(next, targets) })} />
      ) : (
        <ScriptEditor script={condition.script} onChange={(script) => onChange({ script })} questions={questions} loop={loop} />
      )}

      <IssueList issues={issues} />
    </div>
  );
}

function RulesEditor({ rules, targets, onChange }: { rules: RuleRows; targets: RuleTarget[]; onChange: (rules: RuleRows) => void }) {
  const setRow = (i: number, row: RuleRow) => onChange({ ...rules, rows: rules.rows.map((r, j) => (j === i ? row : r)) });
  return (
    <div className="flex flex-col gap-1.5">
      {rules.rows.map((row, i) => (
        <RuleRowEditor
          key={i}
          label={i === 0 ? "if" : rules.match === "any" ? "or" : "and"}
          row={row}
          targets={targets}
          onChange={(next) => setRow(i, next)}
          onRemove={() => onChange({ ...rules, rows: rules.rows.filter((_, j) => j !== i) })}
        />
      ))}
      {targets.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-xs"
          onClick={() => onChange({ ...rules, rows: [...rules.rows, defaultRow(targets[0])] })}
        >
          <Plus className="h-3.5 w-3.5" /> Rule
        </Button>
      ) : (
        <p className="text-[11px] text-muted-foreground">There are no earlier questions to refer to here.</p>
      )}
    </div>
  );
}

const targetKey = (t: { question: string; item?: string }) => (t.item ? `${t.question}.${t.item}` : t.question);

function RuleRowEditor({
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
  const operators = target ? ruleOperators(target.kind) : [];
  const operator = operators.find((o) => o.key === row.operator);
  const options = target?.options ?? [];

  const setOperator = (key: string) => {
    const next = operators.find((o) => o.key === key)!;
    let args = row.args;
    if (next.args === "none") args = [];
    else if (next.args === "range") args = [Number(args[0] ?? 0), Number(args[1] ?? 1)];
    else if (next.args === "number") args = [Number(args[0] ?? 0)];
    else if (next.args === "one") args = args.length ? [args[0]] : options[0] ? [options[0].value] : [];
    onChange({ ...row, operator: key, args });
  };

  let argsInput = null;
  if (operator?.args === "one" && options.length) {
    argsInput = (
      <select
        className={selectClass}
        value={JSON.stringify(row.args[0] ?? null)}
        onChange={(e) => onChange({ ...row, args: [JSON.parse(e.target.value) as OptionValue] })}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={JSON.stringify(o.value)}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    );
  } else if (operator?.args === "several") {
    const toggle = (value: OptionValue) =>
      onChange({ ...row, args: row.args.includes(value) ? row.args.filter((v) => v !== value) : [...row.args, value] });
    argsInput = (
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => toggle(o.value)}
            className={`rounded border px-1.5 py-0.5 text-[11px] ${
              row.args.includes(o.value) ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {optionLabel(o)}
          </button>
        ))}
      </div>
    );
  } else if (operator?.args === "number" || operator?.args === "range") {
    const n = operator.args === "range" ? 2 : 1;
    argsInput = (
      <div className="flex items-center gap-1">
        {Array.from({ length: n }, (_, k) => (
          <Input
            key={k}
            type="number"
            className="h-8 w-20 text-xs"
            value={typeof row.args[k] === "number" ? row.args[k] : ""}
            onChange={(e) => {
              const args = [...row.args];
              args[k] = e.target.value === "" ? 0 : Number(e.target.value);
              onChange({ ...row, args });
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-6 text-muted-foreground">{label}</span>
      <select
        className={`${selectClass} font-mono`}
        value={targetKey(row)}
        onChange={(e) => {
          const next = targets.find((t) => targetKey(t) === e.target.value);
          if (next) onChange(defaultRow(next));
        }}
      >
        {!target && <option value={targetKey(row)}>{targetKey(row)}</option>}
        {targets.map((t) => (
          <option key={targetKey(t)} value={targetKey(t)}>
            {t.label}
          </option>
        ))}
      </select>
      <select className={selectClass} value={row.operator} onChange={(e) => setOperator(e.target.value)}>
        {operators.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {argsInput}
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove rule">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ScriptEditor({
  script,
  onChange,
  questions,
  loop,
}: {
  script: string;
  onChange: (script: string) => void;
  questions: { name: string; variable: AnyVariableType }[];
  loop?: { constants: string[] } | null;
}) {
  const syntaxError = useSyntaxError(script);
  const references = [
    ...referenceOptions(questions).map((o) => o.ref),
    ...(loop ? loop.constants.map((c) => `$const.${c}`) : []),
  ];
  const helpers = questions.flatMap(({ name, variable }) => {
    // Scales: the helpers are on the items.
    const scale = variable.type === "scale";
    const target = scale ? `$var.${name}.items.${variable.items[0]?.name ?? "item"}` : `$var.${name}`;
    return KIND_METHODS[scale ? "ordinal" : questionKind(variable)].map((m) => `${target}.${m}(${m === "count" ? "" : "…"})`);
  });
  const insert = (text: string) => onChange(script.trim() ? `${script} ${text}` : text);

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={script}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        placeholder={`$var.topics.has("sports") && $var.age.gte(18)`}
        className={`font-mono text-xs ${syntaxError ? "border-destructive" : ""}`}
      />
      {syntaxError && <p className="text-xs text-destructive">Syntax error: {syntaxError}</p>}
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none">References and helpers you can use here</summary>
        <div className="mt-1 flex flex-wrap gap-1">
          {[...helpers, ...references].map((ref) => (
            <button
              key={ref}
              type="button"
              className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70"
              onClick={() => insert(ref.replace("(…)", "()"))}
            >
              {ref}
            </button>
          ))}
          {loop && <code className="rounded bg-muted px-1.5 py-0.5">$unit.&lt;field&gt;</code>}
        </div>
        <p className="mt-1">
          A JavaScript expression; the condition holds if it is truthy. Unanswered questions are <code>null</code>{" "}
          (lists: <code>[]</code>), and every helper is false for them. Prefer the helpers: validation checks their
          values.
        </p>
      </details>
    </div>
  );
}

/** QuickJS syntax check of a script, debounced. */
function useSyntaxError(script: string): string | null {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!script.trim()) return setError(null);
      scriptSyntaxError(script)
        .then((e) => !cancelled && setError(e))
        .catch(() => !cancelled && setError(null));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [script]);
  return error;
}
