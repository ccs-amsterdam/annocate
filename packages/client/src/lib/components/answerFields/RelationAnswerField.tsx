import { useState } from "react";
import { optionLabel, type RelationAnswer } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope, useKeyTargets } from "../../keyboard/hooks";
import { useCoderSettings } from "../../context/coderSettings";
import { useRelationAnnotation, type RelationAnnotationState } from "../../context/relationAnnotation";
import { RelationList } from "./RelationList";
import { spanName } from "./relationSpans";
import { RelationTypePicker } from "./RelationTypePicker";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type RelationVariable = Extract<QuestionVariable, { type: "relation" }>;

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

  return (
    <div className="flex flex-col gap-3">
      {pending ? (
        <RelationTypePicker
          ctx={ctx}
          pending={pending}
          options={typeOptions}
          keys={keys[0] ?? []}
          isDark={theme === "dark"}
        />
      ) : (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {nextStep(ctx)}
        </p>
      )}

      {ctx.relations.length > 0 && (
        <RelationList
          ctx={ctx}
          notes={comments ? notes : null}
          onNote={(id, comment) => setNotes({ ...notes, [id]: comment })}
        />
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

/** What the coder does next, while no pair waits for its type. */
function nextStep(ctx: RelationAnnotationState): string {
  if (ctx.spans.length === 0) return "There are no spans to relate in this unit.";
  if (!ctx.start) return "Click a span where a relation starts, then the span it goes to.";
  const start = ctx.spans.find((s) => s.id === ctx.start);
  return `From ${spanName(start)}: now click where the relation goes (Esc to cancel).`;
}
