import { ArrowRight, X } from "lucide-react";
import { MAX_COMMENT_LENGTH, type RelationAnswer } from "@annotinder/contracts";
import type { RelationAnnotationState } from "../../context/relationAnnotation";
import { getCodeBadgeStyle } from "../../utils/color";
import { optionColor, optionLabelOf } from "../spanText";
import { spanName } from "./relationSpans";

interface RelationListProps {
  ctx: RelationAnnotationState;
  /** The comment per relation, by relation id. Null: the question has no comments. */
  notes: Record<string, string> | null;
  onNote: (relationId: string, comment: string) => void;
}

/** The relations made, to open or remove (and to comment on). */
export function RelationList({ ctx, notes, onNote }: RelationListProps) {
  return (
    <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto border-t border-border pt-2" aria-label="Relations">
      {ctx.relations.map((relation) => (
        <RelationRow key={relation.id} relation={relation} ctx={ctx} notes={notes} onNote={onNote} />
      ))}
    </ul>
  );
}

/** A relation: from, its type, to. Pointing at it draws its arrow fully; clicking opens it. */
function RelationRow({ relation, ctx, notes, onNote }: RelationListProps & { relation: RelationAnswer }) {
  const span = (id: string) => ctx.spans.find((s) => s.id === id);
  return (
    <li
      onPointerEnter={() => ctx.setHighlighted(relation.id)}
      onPointerLeave={() => ctx.setHighlighted(null)}
      className="flex items-center gap-1 rounded bg-muted/50 px-2 py-1 text-xs"
    >
      <button
        type="button"
        onClick={() => ctx.openRelation(relation.id)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
      >
        <span className="truncate">{spanName(span(relation.fromId))}</span>
        <span
          className="shrink-0 rounded border px-1.5 font-semibold"
          style={getCodeBadgeStyle(optionColor(ctx.options, relation.value))}
        >
          {optionLabelOf(ctx.options, relation.value)}
        </span>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{spanName(span(relation.toId))}</span>
      </button>
      {notes && (
        <input
          aria-label="Comment on this relation"
          placeholder="comment"
          maxLength={MAX_COMMENT_LENGTH}
          value={notes[relation.id] ?? ""}
          onChange={(e) => onNote(relation.id, e.target.value)}
          className="h-6 w-28 shrink-0 rounded border border-border bg-background px-1.5 text-xs"
        />
      )}
      <button
        type="button"
        onClick={() => ctx.remove(relation.id)}
        aria-label="Remove this relation"
        className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}
