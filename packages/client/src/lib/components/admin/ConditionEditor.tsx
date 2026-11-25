import { useEffect, useMemo, useState } from "react";
import { Code2, ListFilter, Plus } from "lucide-react";
import {
  KIND_METHODS,
  parseSimpleCondition,
  questionKind,
  referenceOptions,
  type AnyVariableType,
  type DesignIssue,
  type Condition,
} from "@annotinder/contracts";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { scriptSyntaxError } from "../../codebook/expression";
import {
  conditionToRows,
  defaultRow,
  rowProblems,
  rowsToScript,
  ruleTargets,
  type RuleRow,
  type RuleRows,
  type RuleTarget,
} from "../../design/conditionRules";
import { selectClass } from "./conditionEditor/classes";
import { RuleRowEditor } from "./conditionEditor/RuleRowEditor";
import { SegmentedToggle } from "./designEditor/SegmentedToggle";
import { IssueList } from "./IssueList";
import { HelpButton } from "../../help/HelpButton";

type Mode = "rules" | "script";

export interface ConditionEditorProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  /** The questions a reference may use here (contracts `availableQuestions`). */
  questions: { name: string; variable: AnyVariableType }[];
  /** Inside a unit loop: `$unit` fields can be used too. */
  loop?: boolean;
  /** Validation issues of this condition (errors and warnings). */
  issues?: DesignIssue[];
}

/**
 * Edits a condition (docs/client.md §5 "References and conditions"). A
 * condition is a script; the rules mode reads and writes the simple ones
 * (rows of helper calls, all joined by "and" or all by "or"). Anything else
 * is edited as a script, which uses the same helpers.
 */
export function ConditionEditor({ condition, onChange, questions, loop, issues = [] }: ConditionEditorProps) {
  const targets = useMemo(() => ruleTargets(questions), [questions]);
  const rules = useMemo(() => {
    const simple =
      condition.script.trim() === "" ? { op: "const" as const, value: true } : parseSimpleCondition(condition.script);
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
              window.alert(
                'This script can\'t be shown as rules: rules are a list of comparisons joined by all "and" or all "or". Edit it as a script, or clear it to start over.',
              );
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
            onChange={(e) =>
              onChange({ script: rowsToScript({ ...rules, match: e.target.value as "all" | "any" }, targets) })
            }
          >
            <option value="all">All rules must hold</option>
            <option value="any">Any rule may hold</option>
          </select>
        )}
      </div>

      {shown === "rules" && rules ? (
        <RulesEditor
          rules={rules}
          targets={targets}
          onChange={(next) => onChange({ script: rowsToScript(next, targets) })}
        />
      ) : (
        <ScriptEditor
          script={condition.script}
          onChange={(script) => onChange({ script })}
          questions={questions}
          loop={loop}
        />
      )}

      {/* In the rules, each row shows its own problems. */}
      {!(shown === "rules" && rules?.rows.some((row) => rowProblems(row, targets).length > 0)) && (
        <IssueList issues={issues} />
      )}
    </div>
  );
}

/** The rules mode: a row per rule, joined by "and" or "or". */
function RulesEditor({
  rules,
  targets,
  onChange,
}: {
  rules: RuleRows;
  targets: RuleTarget[];
  onChange: (rules: RuleRows) => void;
}) {
  const setRow = (i: number, row: RuleRow) =>
    onChange({ ...rules, rows: rules.rows.map((r, j) => (j === i ? row : r)) });
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

/** The script mode: the script, its syntax error, and the references and helpers to insert. */
function ScriptEditor({
  script,
  onChange,
  questions,
  loop,
}: {
  script: string;
  onChange: (script: string) => void;
  questions: { name: string; variable: AnyVariableType }[];
  loop?: boolean;
}) {
  const syntaxError = useSyntaxError(script);
  const references = referenceOptions(questions).map((o) => o.ref);
  const helpers = questions.flatMap(({ name, variable }) => {
    // Scales: the helpers are on the items.
    const scale = variable.type === "scale";
    const target = scale ? `$var.${name}.items.${variable.items[0]?.name ?? "item"}` : `$var.${name}`;
    return KIND_METHODS[scale ? "ordinal" : questionKind(variable)].map(
      (m) => `${target}.${m}(${m === "count" ? "" : "…"})`,
    );
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
        <HelpButton topic="scripts" className="mt-1">
          More about scripts
        </HelpButton>
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
