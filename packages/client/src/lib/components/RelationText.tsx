import { Fragment } from "react";
import { useRelationAnnotation, type RelationSpan } from "../context/relationAnnotation";
import { getStackedUnderlineStyle } from "../utils/color";
import { spanSummary, textSegments } from "./spanText";

/**
 * A unit field during a relation question (docs/client.md §4 "Span and
 * relation answers"): the text with the spans the question's rules name, as
 * buttons. Without a start, the spans a relation can start at can be
 * clicked; with one, the spans it can go to. Each span's parts carry
 * `data-relation-span` (its id), where the arrows attach (`RelationArrows`).
 */
export function RelationText({ text, field, inline = false }: { text: string; field: string; inline?: boolean }) {
  const ctx = useRelationAnnotation()!;
  const spans = ctx.spans.filter((s) => s.field === field);
  const segments = textSegments<RelationSpan>(text, spans, null);
  const usable = (s: RelationSpan) =>
    ctx.start === null ? ctx.canStart(s.id) : s.id === ctx.start || ctx.canEnd(s.id);
  const Container = inline ? "span" : "div";
  return (
    // Taller lines than usual: the arrows arch between them
    <Container className="rounded p-1 leading-[2.6] whitespace-pre-wrap">
      {segments.map((seg, i) => {
        const content = text.slice(seg.start, seg.end);
        if (seg.spans.length === 0) return <Fragment key={i}>{content}</Fragment>;
        // Overlapping spans: a click takes the first that can be used now
        const target = seg.spans.find(usable);
        const isStart = seg.spans.some((s) => s.id === ctx.start);
        const style = getStackedUnderlineStyle(
          seg.spans.map((s) => ({
            color: s.color,
            isStart: s.slices.some((sl) => sl.offset === seg.start),
            isEnd: s.slices.some((sl) => sl.offset + sl.length === seg.end),
          })),
        );
        const name = seg.spans.map((s) => `${s.label}: "${spanSummary(s.slices)}"`).join(", ");
        return (
          <button
            key={i}
            type="button"
            data-relation-span={seg.spans.map((s) => s.id).join(" ")}
            disabled={!target}
            aria-pressed={isStart}
            aria-label={isStart ? `${name}, relation starts here` : name}
            style={style}
            onClick={() => target && ctx.clickSpan(target.id)}
            onPointerEnter={() => ctx.setHighlighted(seg.spans[0].id)}
            onPointerLeave={() => ctx.setHighlighted(null)}
            onFocus={() => ctx.setHighlighted(seg.spans[0].id)}
            onBlur={() => ctx.setHighlighted(null)}
            className={`inline cursor-pointer rounded-sm p-0 text-left font-normal whitespace-pre-wrap transition-opacity disabled:cursor-default disabled:opacity-40 ${
              isStart ? "ring-2 ring-wood ring-offset-1 ring-offset-background" : ""
            }`}
          >
            {content}
          </button>
        );
      })}
    </Container>
  );
}
