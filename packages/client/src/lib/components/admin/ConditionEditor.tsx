import { useEffect, useMemo, useState } from "react";
import { Code2, ListFilter, Plus, Trash2 } from "lucide-react";
import {
  NUMERIC_OPS,
  parseReference,
  referenceOptions,
  rulesToScript,
  type AnyVariableType,
  type CodebookValidationIssue,
  type Condition,
  type ConditionOp,
  type ConditionRule,
  type ReferenceShape,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { scriptSyntaxError } from "../../codebook/expression";
import { SegmentedToggle } from "./codebookEditor/SegmentedToggle";
import { IssueList } from "./IssueList";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";
const OP_LABELS: Record<ConditionOp, string> = { is: "is", isnot: "is not", gt: ">", gte: "≥", lt: "<", lte: "≤" };
const UNIT_FIELD = "__unit_field__";

type Mode = "rules" | "script";
type OkShape = Extract<ReferenceShape, { ok: true }>;

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
 * Edits a condition (docs/client.md "References and conditions"): rules
 * (reference, operator, value) or a script. The reference picker lists only
 * what validation accepts at this point. Switching from rules to a script
 * pre-fills the equivalent script; back only discards the script after a
 * confirm.
 */
export function ConditionEditor({ condition, onChange, questions, loop, issues = [] }: ConditionEditorProps) {
  const mode: Mode = "script" in condition ? "script" : "rules";
  const options = useMemo(() => referenceOptions(questions), [questions]);
  const shapes = useMemo(() => new Map(options.map((o) => [o.ref, o.shape])), [options]);
  const shapeOf = (ref: string): OkShape | undefined => {
    if (shapes.has(ref)) return shapes.get(ref);
    const parsed = parseReference(ref);
    if ("error" in parsed) return undefined;
    if (parsed.ref.ns === "unit") return { ok: true, array: false, type: "any" };
    if (parsed.ref.ns === "const") return { ok: true, array: false, type: "string" };
    return undefined;
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "script" && !("script" in condition)) {
      onChange({ script: rulesToScript(condition, (ref) => shapeOf(ref)?.array ?? false) });
    } else if (next === "rules" && "script" in condition) {
      const empty = condition.script.trim() === "" || condition.script.trim() === "true";
      if (empty || window.confirm("Switching to rules discards the script. Continue?")) onChange({ rules: [] });
    }
  };

  const refChoices = [
    ...options.map((o) => o.ref),
    ...(loop ? loop.constants.map((c) => `$const.${c}`) : []),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SegmentedToggle
          value={mode}
          onChange={switchMode}
          options={[
            { value: "rules", label: "Rules", icon: ListFilter },
            { value: "script", label: "Script", icon: Code2 },
          ]}
        />
        {"rules" in condition && condition.rules.length > 1 && (
          <select
            className={selectClass}
            value={condition.match ?? "all"}
            onChange={(e) => onChange({ ...condition, match: e.target.value as "all" | "any" })}
          >
            <option value="all">All rules must hold</option>
            <option value="any">Any rule may hold</option>
          </select>
        )}
      </div>

      {"script" in condition ? (
        <ScriptEditor
          script={condition.script}
          onChange={(script) => onChange({ script })}
          references={refChoices}
          loop={Boolean(loop)}
        />
      ) : (
        <RulesEditor
          rules={condition.rules}
          match={condition.match}
          onChange={(rules) => onChange({ ...condition, rules })}
          refChoices={refChoices}
          loop={Boolean(loop)}
          shapeOf={shapeOf}
        />
      )}

      <IssueList issues={issues} />
    </div>
  );
}

function RulesEditor({
  rules,
  match,
  onChange,
  refChoices,
  loop,
  shapeOf,
}: {
  rules: ConditionRule[];
  match?: "all" | "any";
  onChange: (rules: ConditionRule[]) => void;
  refChoices: string[];
  loop: boolean;
  shapeOf: (ref: string) => OkShape | undefined;
}) {
  const setRule = (i: number, rule: ConditionRule) => onChange(rules.map((r, j) => (j === i ? rule : r)));
  const firstRef = refChoices[0] ?? (loop ? "$unit." : "");

  return (
    <div className="flex flex-col gap-1.5">
      {rules.length === 0 && <p className="text-[11px] text-muted-foreground">No rules: always holds.</p>}
      {rules.map((rule, i) => (
        <RuleRow
          key={i}
          label={i === 0 ? "if" : match === "any" ? "or" : "and"}
          rule={rule}
          refChoices={refChoices}
          loop={loop}
          shape={shapeOf(rule.ref)}
          onChange={(next) => setRule(i, next)}
          onRemove={() => onChange(rules.filter((_, j) => j !== i))}
        />
      ))}
      {firstRef !== "" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-xs"
          onClick={() => onChange([...rules, defaultRule(firstRef, shapeOf(firstRef))])}
        >
          <Plus className="h-3.5 w-3.5" /> Rule
        </Button>
      )}
      {firstRef === "" && (
        <p className="text-[11px] text-muted-foreground">There are no earlier questions to refer to here.</p>
      )}
    </div>
  );
}

function defaultRule(ref: string, shape: OkShape | undefined): ConditionRule {
  if (shape?.type === "boolean") return { ref, op: "is", value: true };
  if (shape?.type === "number") return { ref, op: "gte", value: 0 };
  return { ref, op: "is", value: shape?.codes?.[0] ?? "" };
}

function RuleRow({
  label,
  rule,
  refChoices,
  loop,
  shape,
  onChange,
  onRemove,
}: {
  label: string;
  rule: ConditionRule;
  refChoices: string[];
  loop: boolean;
  shape: OkShape | undefined;
  onChange: (rule: ConditionRule) => void;
  onRemove: () => void;
}) {
  const isUnit = rule.ref.startsWith("$unit.");
  const numericOk = shape !== undefined && !shape.array && (shape.type === "number" || shape.type === "any");
  const ops = (Object.keys(OP_LABELS) as ConditionOp[]).filter((op) => !NUMERIC_OPS.includes(op) || numericOk);
  const numeric = NUMERIC_OPS.includes(rule.op);
  const values = Array.isArray(rule.value) ? rule.value.map(String) : [String(rule.value)];

  const setRef = (ref: string, nextShape: OkShape | undefined) => onChange(defaultRule(ref, nextShape));

  let valueInput;
  if (numeric) {
    valueInput = (
      <Input
        type="number"
        className="h-8 w-24 text-xs"
        value={typeof rule.value === "number" ? rule.value : ""}
        onChange={(e) => onChange({ ...rule, value: e.target.value === "" ? 0 : Number(e.target.value) })}
      />
    );
  } else if (shape?.type === "boolean") {
    valueInput = (
      <select
        className={selectClass}
        value={String(rule.value)}
        onChange={(e) => onChange({ ...rule, value: e.target.value === "true" })}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else if (shape?.codes && shape.codes.length > 0) {
    // Codes as toggles: several selected means "any of"
    const toggle = (code: string) => {
      const next = values.includes(code) ? values.filter((v) => v !== code) : [...values.filter((v) => v !== ""), code];
      onChange({ ...rule, value: next.length === 1 ? next[0] : next.length === 0 ? "" : next });
    };
    valueInput = (
      <div className="flex flex-wrap gap-1">
        {shape.codes.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            className={`rounded border px-1.5 py-0.5 text-[11px] ${
              values.includes(code) ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {code}
          </button>
        ))}
      </div>
    );
  } else {
    valueInput = (
      <Input
        className="h-8 text-xs"
        placeholder="value, or a, b, c"
        value={values.join(", ")}
        onChange={(e) => {
          const parts = e.target.value.split(",").map((v) => v.trim());
          onChange({ ...rule, value: parts.length > 1 ? parts : parts[0] });
        }}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-6 text-muted-foreground">{label}</span>
      <select
        className={`${selectClass} font-mono`}
        value={isUnit ? UNIT_FIELD : rule.ref}
        onChange={(e) => {
          const ref = e.target.value === UNIT_FIELD ? "$unit." : e.target.value;
          setRef(ref, ref === "$unit." ? { ok: true, array: false, type: "any" } : undefined);
        }}
      >
        {!refChoices.includes(rule.ref) && !isUnit && <option value={rule.ref}>{rule.ref || "(choose)"}</option>}
        {refChoices.map((ref) => (
          <option key={ref} value={ref}>
            {ref}
          </option>
        ))}
        {loop && <option value={UNIT_FIELD}>$unit.(field)</option>}
      </select>
      {isUnit && (
        <Input
          className="h-8 w-28 font-mono text-xs"
          placeholder="field"
          value={rule.ref.slice("$unit.".length)}
          onChange={(e) => onChange({ ...rule, ref: `$unit.${e.target.value.trim()}` })}
        />
      )}
      <select
        className={selectClass}
        value={rule.op}
        onChange={(e) => {
          const op = e.target.value as ConditionOp;
          const toNumeric = NUMERIC_OPS.includes(op);
          if (toNumeric === numeric) onChange({ ...rule, op });
          else onChange({ ...rule, op, value: toNumeric ? 0 : (shape?.codes?.[0] ?? "") });
        }}
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      {valueInput}
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ScriptEditor({
  script,
  onChange,
  references,
  loop,
}: {
  script: string;
  onChange: (script: string) => void;
  references: string[];
  loop: boolean;
}) {
  const syntaxError = useSyntaxError(script);
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={script}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        placeholder="$var.role.code === 'student' && $var.interest.tech.value >= 4"
        className={`font-mono text-xs ${syntaxError ? "border-destructive" : ""}`}
      />
      {syntaxError && <p className="text-xs text-destructive">Syntax error: {syntaxError}</p>}
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none">References you can use here</summary>
        <div className="mt-1 flex flex-wrap gap-1">
          {references.map((ref) => (
            <button
              key={ref}
              type="button"
              className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70"
              onClick={() => onChange(script.trim() ? `${script} ${ref}` : ref)}
            >
              {ref}
            </button>
          ))}
          {loop && <code className="rounded bg-muted px-1.5 py-0.5">$unit.&lt;field&gt;</code>}
        </div>
        <p className="mt-1">
          A JavaScript expression; the condition holds if it is truthy. Unanswered questions are <code>null</code>{" "}
          (lists: <code>[]</code>).
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
