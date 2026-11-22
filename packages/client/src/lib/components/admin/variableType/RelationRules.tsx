import { Plus, Trash2 } from "lucide-react";
import { optionLabel, type RelationEnd, type RelationRule } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ToggleChip } from "./ToggleChip";

/** A span question a rule can name: its name and labels. */
export interface SpanQuestion {
  name: string;
  options: { value: string; label?: string }[];
}

const toggle = <T,>(list: readonly T[] | undefined, value: T): T[] | undefined => {
  const next = (list ?? []).includes(value) ? (list ?? []).filter((v) => v !== value) : [...(list ?? []), value];
  return next.length > 0 ? next : undefined;
};

/**
 * A relation question's rules (docs/client.md §4 "Span and relation
 * answers"): per rule, the spans a relation can go from and to (a span
 * question of the loop, any label or some), and the relation types it
 * allows (none chosen: all).
 */
export function RelationRules({
  rules,
  types,
  spanQuestions,
  onChange,
}: {
  rules: RelationRule[];
  /** The question's relation types (its options). */
  types: { value: string; label?: string }[];
  /** The span questions before it in its loop. */
  spanQuestions: SpanQuestion[];
  onChange: (rules: RelationRule[]) => void;
}) {
  const first = spanQuestions[0]?.name ?? "";
  const update = (i: number, rule: RelationRule) => onChange(rules.map((r, j) => (j === i ? rule : r)));
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">Which relations coders can make</div>
      {spanQuestions.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Relations go between spans: add a span question before this one in the loop.
        </p>
      )}
      {rules.map((rule, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <EndPicker
                label="From"
                end={rule.from}
                spanQuestions={spanQuestions}
                onChange={(from) => update(i, { ...rule, from })}
              />
              <EndPicker
                label="To"
                end={rule.to}
                spanQuestions={spanQuestions}
                onChange={(to) => update(i, { ...rule, to })}
              />
            </div>
            <IconButton
              icon={Trash2}
              label="Remove this rule"
              onClick={() => onChange(rules.filter((_, j) => j !== i))}
              disabled={rules.length === 1}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground">Types:</span>
            {types.map((t) => (
              <ToggleChip
                key={t.value}
                on={!rule.options || rule.options.includes(t.value)}
                pressed={rule.options?.includes(t.value) ?? false}
                onClick={() => update(i, { ...rule, options: toggle(rule.options, t.value) })}
              >
                {optionLabel(t)}
              </ToggleChip>
            ))}
            {!rule.options && <span className="text-muted-foreground">(all)</span>}
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...rules, { from: { variable: first }, to: { variable: first } }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Rule
      </Button>
    </div>
  );
}

/** One end of a rule: the span question, and which of its labels (none chosen: any). */
function EndPicker({
  label,
  end,
  spanQuestions,
  onChange,
}: {
  label: string;
  end: RelationEnd;
  spanQuestions: SpanQuestion[];
  onChange: (end: RelationEnd) => void;
}) {
  const question = spanQuestions.find((q) => q.name === end.variable);
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-xs font-medium">
        {label}
        <select
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          value={end.variable}
          onChange={(e) => onChange({ variable: e.target.value })}
        >
          <option value="">-- span question --</option>
          {spanQuestions.map((q) => (
            <option key={q.name} value={q.name}>
              {q.name}
            </option>
          ))}
          {end.variable && !question && <option value={end.variable}>{end.variable} (not a span question here)</option>}
        </select>
      </label>
      {question && (
        <div className="flex flex-wrap items-center gap-1">
          {question.options.map((o) => (
            <ToggleChip
              key={o.value}
              on={!end.values || end.values.includes(o.value)}
              pressed={end.values?.includes(o.value) ?? false}
              onClick={() => onChange({ ...end, values: toggle(end.values, o.value) })}
            >
              {optionLabel(o)}
            </ToggleChip>
          ))}
          {!end.values && <span className="text-xs text-muted-foreground">(any label)</span>}
        </div>
      )}
    </div>
  );
}
