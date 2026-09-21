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
  const summary = span.slices.map((s) => s.text).join(" ... ");
  return `"${summary}" (${span.code})`;
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

  function handleAdd() {
    if (!fromId || !toId || !code) return;
    if (relations.some((r) => r.fromId === fromId && r.toId === toId && r.code === code)) {
      return;
    }
    setRelations((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fromId,
        toId,
        code,
      },
    ]);
    setFromId("");
    setToId("");
  }

  function handleRemove(id: string) {
    setRelations((prev) => prev.filter((r) => r.id !== id));
  }

  function colorFor(codeName: string): string | undefined {
    return variable.codes.find((c) => c.code === codeName)?.color;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Link {variable.from.variable} to {variable.to.variable}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Select from {variable.from.variable}...</option>
          {fromSpans.map((s) => (
            <option key={s.id} value={s.id}>
              {spanLabel(s)}
            </option>
          ))}
        </select>

        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {variable.codes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>

        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Select to {variable.to.variable}...</option>
          {toSpans.map((s) => (
            <option key={s.id} value={s.id}>
              {spanLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!fromId || !toId || !code}
          onClick={handleAdd}
          className="text-xs"
        >
          Link
        </Button>
      </div>

      {relations.length > 0 && (
        <div className="flex flex-col gap-1 pt-1 border-t border-border">
          <span className="text-xs font-semibold text-muted-foreground">Relations ({relations.length}):</span>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {relations.map((rel) => {
              const from = fromSpans.find((s) => s.id === rel.fromId);
              const to = toSpans.find((s) => s.id === rel.toId);
              const badgeStyle = getCodeBadgeStyle(colorFor(rel.code));
              return (
                <div
                  key={rel.id}
                  className="flex items-center justify-between gap-1 rounded bg-muted/50 px-2 py-1 text-xs"
                >
                  <span className="truncate">{spanLabel(from)}</span>
                  <span className="rounded border px-1.5 py-0.2 font-semibold shrink-0" style={badgeStyle}>
                    {rel.code}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{spanLabel(to)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(rel.id)}
                    className="text-muted-foreground hover:text-foreground shrink-0 ml-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAnswer({ done: true, skip: true, relations: [] })}
          className="text-xs text-muted-foreground"
        >
          Skip
        </Button>
        <Button
          size="sm"
          onClick={() => onAnswer({ done: true, skip: false, relations })}
        >
          Done ({relations.length})
        </Button>
      </div>
    </div>
  );
}
