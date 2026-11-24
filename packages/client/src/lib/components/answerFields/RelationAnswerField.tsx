import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { MAX_COMMENT_LENGTH, optionLabel, type RelationAnswer } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope, useKeyTargets } from "../../keyboard/hooks";
import { useCoderSettings } from "../../context/coderSettings";
import { useRelationAnnotation, type RelationSpan } from "../../context/relationAnnotation";
import { getCodeBadgeStyle, getCodeButtonStyle } from "../../utils/color";
import { ShortcutBadge } from "../ShortcutBadge";
import { optionColor, optionLabelOf, spanSummary } from "../spanText";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type RelationVariable = Extract<QuestionVariable, { type: "relation" }>;

const spanName = (span: RelationSpan | undefined) => (span ? `"${spanSummary(span.slices)}"` : "(a span)");

/**
 * The answer field of a `relation` question (docs/client.md §4 "Span and
 * relation answers"). Relations are made in the text (`RelationText`): click
 * where one starts, then where it goes. Here: what to do next, the relation
 * type when there is a choice (keys 1-9, Esc to cancel), and the relations
 * made, to open or remove.
 */
export function RelationAnswerField({
  onAnswer,
  initialValue,
  comments = false,
}: AnswerFieldProps<RelationVariable> & { comments?: boolean }) {
  const ctx = useRelationAnnotation();
  // A comment per relation (the question's `comments`), by relation id
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries((initialValue?.relations ?? []).flatMap((r) => (r.comment ? [[r.id, r.comment]] : []))),
  );
  const withComments = (relations: RelationAnswer[]) =>
    relations.map((r) => (notes[r.id]?.trim() ? { ...r, comment: notes[r.id].trim() } : r));
  const { theme } = useCoderSettings();
  const pending = ctx?.pending ?? null;
  const types = pending && ctx ? ctx.typesFor(pending.fromId, pending.toId) : [];
  const typeOptions = (ctx?.options ?? []).filter((o) => types.includes(o.value));
  const { keys } = useKeyTargets(pending ? [typeOptions.map((o) => ({ label: optionLabel(o) }))] : null, (_, i) =>
    ctx?.choose(typeOptions[i].value),
  );
  useKeyScope(
    (press) => {
      if (press.key !== "Escape" || !ctx) return false;
      ctx.cancel();
      return true;
    },
    !!ctx && (ctx.start !== null || pending !== null),
    { priority: PRIORITY.field },
  );
  if (!ctx) return null;
  const span = (id: string) => ctx.spans.find((s) => s.id === id);
  const chosen = (type: string) =>
    !!pending && ctx.relations.some((r) => r.fromId === pending.fromId && r.toId === pending.toId && r.value === type);

  return (
    <div className="flex flex-col gap-3">
      {pending ? (
        <div className="flex flex-col gap-2" role="group" aria-label="Relation type">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{spanName(span(pending.fromId))}</span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className="truncate">{spanName(span(pending.toId))}</span>
            </span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={ctx.cancel}>
              Cancel
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {typeOptions.map((option, i) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={chosen(option.value)}
                onClick={() => ctx.choose(option.value)}
                className="relative flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs font-semibold shadow-xs"
                style={getCodeButtonStyle(option.color, chosen(option.value), theme === "dark")}
              >
                {keys[0]?.[i] && <ShortcutBadge shortcut={keys[0][i]!} />}
                {optionLabel(option)}
                {chosen(option.value) && <span className="ml-1 font-normal">(remove)</span>}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {ctx.spans.length === 0
            ? "There are no spans to relate in this unit."
            : ctx.start
              ? `From ${spanName(span(ctx.start))}: now click where the relation goes (Esc to cancel).`
              : "Click a span where a relation starts, then the span it goes to."}
        </p>
      )}

      {ctx.relations.length > 0 && (
        <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto border-t border-border pt-2" aria-label="Relations">
          {ctx.relations.map((r) => (
            <li
              key={r.id}
              onPointerEnter={() => ctx.setHighlighted(r.id)}
              onPointerLeave={() => ctx.setHighlighted(null)}
              className="flex items-center gap-1 rounded bg-muted/50 px-2 py-1 text-xs"
            >
              <button
                type="button"
                onClick={() => ctx.openRelation(r.id)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
              >
                <span className="truncate">{spanName(span(r.fromId))}</span>
                <span
                  className="shrink-0 rounded border px-1.5 font-semibold"
                  style={getCodeBadgeStyle(optionColor(ctx.options, r.value))}
                >
                  {optionLabelOf(ctx.options, r.value)}
                </span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{spanName(span(r.toId))}</span>
              </button>
              {comments && (
                <input
                  aria-label="Comment on this relation"
                  placeholder="comment"
                  maxLength={MAX_COMMENT_LENGTH}
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  className="h-6 w-28 shrink-0 rounded border border-border bg-background px-1.5 text-xs"
                />
              )}
              <button
                type="button"
                onClick={() => ctx.remove(r.id)}
                aria-label="Remove this relation"
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAnswer({ done: true, skip: true, relations: [] })}
          className="text-xs text-muted-foreground"
        >
          Skip
        </Button>
        <Button size="sm" onClick={() => onAnswer({ done: true, skip: false, relations: withComments(ctx.relations) })}>
          Done ({ctx.relations.length})
        </Button>
      </div>
    </div>
  );
}
