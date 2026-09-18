import { useState } from "react";
import type { RelationAnswer, RelationOptions, SpanAnswer, VariableValue } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type RelationVariable = Extract<QuestionVariable, { type: "relation" }>;

/** The spans available as one endpoint of a relation: this unit's spans
 * submitted so far for `opts.variable` (a sibling `span` unit_variable),
 * optionally filtered to just the codes listed in `opts.values`. */
function endpointSpans(unitVariables: Record<string, VariableValue> | undefined, opts: RelationOptions): SpanAnswer[] {
  const spans = unitVariables?.[opts.variable]?.spans ?? [];
  if (!opts.values || opts.values.length === 0) return spans;
  return spans.filter((s) => opts.values?.includes(s.code));
}

function spanLabel(span: SpanAnswer | undefined): string {
  if (!span) return "(unknown span)";
  return `"${span.text}" (${span.code})`;
}

/**
 * Answer field for `relation` unit_variables (design plan §11a/§4.3):
 * links two already-created spans (from sibling `span` unit_variables named
 * in `variable.from`/`variable.to`) with a relation code, e.g. an actor
 * span related to an issue span via a "position" code.
 *
 * Unlike spans, relations don't need a dedicated interactive text-selection
 * component -- both endpoints already exist as spans, so the coder just
 * picks two from dropdowns (labeled with the span's own selected text, via
 * `SpanAnswer.text`, §11f) and a relation code, then adds the pair to a
 * list. Requires `unitVariables` (this unit's previously-submitted answers,
 * threaded down from `JobManager.currentUnitVariables` via
 * `Question`/`JobRunner`) to find the candidate spans -- `variable.from`/
 * `variable.to` name the sibling `span` variable(s) to pick endpoints from.
 */
export function RelationAnswerField({ variable, unitVariables, onAnswer }: AnswerFieldProps<RelationVariable>) {
  const fromSpans = endpointSpans(unitVariables, variable.from);
  const toSpans = endpointSpans(unitVariables, variable.to);

  const [relations, setRelations] = useState<RelationAnswer[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [code, setCode] = useState(variable.codes[0]?.code ?? "");

  function addRelation() {
    if (!fromId || !toId || !code) return;
    setRelations((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, fromId, toId, code },
    ]);
    setFromId("");
    setToId("");
  }

  function removeRelation(id: string) {
    setRelations((prev) => prev.filter((r) => r.id !== id));
  }

  const canAddMore = fromSpans.length > 0 && toSpans.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {!canAddMore && (
        <p className="text-sm italic text-muted-foreground">
          No spans available yet to relate -- answer the relevant span question(s) first.
        </p>
      )}

      {canAddMore && (
        <div className="flex flex-wrap items-center gap-2 rounded border bg-muted/50 p-2 text-sm">
          <select className="rounded border bg-background px-2 py-1" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">-- from --</option>
            {fromSpans.map((s) => (
              <option key={s.id} value={s.id}>
                {spanLabel(s)}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">→</span>
          <select className="rounded border bg-background px-2 py-1" value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">-- to --</option>
            {toSpans.map((s) => (
              <option key={s.id} value={s.id}>
                {spanLabel(s)}
              </option>
            ))}
          </select>
          <select className="rounded border bg-background px-2 py-1" value={code} onChange={(e) => setCode(e.target.value)}>
            {variable.codes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
            disabled={!fromId || !toId}
            onClick={addRelation}
          >
            Add
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {relations.length === 0 && <li className="text-sm italic text-muted-foreground">No relations yet</li>}
        {relations.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <span>{spanLabel(fromSpans.find((s) => s.id === r.fromId))}</span>
            <span className="text-muted-foreground">--[{r.code}]→</span>
            <span>{spanLabel(toSpans.find((s) => s.id === r.toId))}</span>
            <button
              type="button"
              className="text-muted-foreground underline hover:text-destructive"
              onClick={() => removeRelation(r.id)}
            >
              remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => onAnswer({ done: true, skip: true })}>
          Skip
        </Button>
        <Button onClick={() => onAnswer({ done: true, skip: false, relations })}>Done</Button>
      </div>
    </div>
  );
}
