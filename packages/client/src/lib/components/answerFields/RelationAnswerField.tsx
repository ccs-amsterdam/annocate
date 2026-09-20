import { useState } from "react";
import type { RelationAnswer, RelationOptions, SpanAnswer, VariableValue } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { getCodeBadgeStyle } from "../../utils/color";
import { X, ArrowRight } from "lucide-react";

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
 * in `variable.from`/`variable.to`) with a relation code.
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

  function colorFor(codeName: string): string | undefined {
    return variable.codes.find((c) => c.code === codeName)?.color;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {!canAddMore && (
        <p className="text-xs italic text-muted-foreground">
          No spans available yet to relate -- answer the relevant span question(s) first.
        </p>
      )}

      {canAddMore && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 p-2 text-xs">
          <select
            className="rounded border border-input bg-background px-2 py-1 text-xs max-w-[130px] truncate"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
          >
            <option value="">-- from --</option>
            {fromSpans.map((s) => (
              <option key={s.id} value={s.id}>
                {spanLabel(s)}
              </option>
            ))}
          </select>
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <select
            className="rounded border border-input bg-background px-2 py-1 text-xs max-w-[130px] truncate"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
          >
            <option value="">-- to --</option>
            {toSpans.map((s) => (
              <option key={s.id} value={s.id}>
                {spanLabel(s)}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-input bg-background px-2 py-1 text-xs"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          >
            {variable.codes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={!fromId || !toId}
            onClick={addRelation}
          >
            Add
          </Button>
        </div>
      )}

      <div className="max-h-28 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-2">
        {relations.length === 0 ? (
          <p className="text-xs italic text-muted-foreground text-center py-1">No relations added yet</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {relations.map((r) => {
              const fromSpan = fromSpans.find((s) => s.id === r.fromId);
              const toSpan = toSpans.find((s) => s.id === r.toId);
              const badgeStyle = getCodeBadgeStyle(colorFor(r.code));

              return (
                <li key={r.id} className="flex items-center justify-between gap-2 text-xs rounded border bg-card p-1.5">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-medium truncate">&ldquo;{fromSpan?.text ?? r.fromId}&rdquo;</span>
                    <span className="rounded border px-1.5 py-0.2 font-semibold" style={badgeStyle}>
                      {r.code}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">&ldquo;{toSpan?.text ?? r.toId}&rdquo;</span>
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive shrink-0 p-0.5"
                    title="Remove relation"
                    onClick={() => removeRelation(r.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => onAnswer({ done: true, skip: true })}>
          Skip
        </Button>
        <Button size="sm" onClick={() => onAnswer({ done: true, skip: false, relations })}>
          Done
        </Button>
      </div>
    </div>
  );
}
