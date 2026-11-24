import { useMemo } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import { useSpanAnnotation, type PendingSpan, type SpanAnnotationState } from "../../context/spanAnnotation";

/**
 * The span question's state as one unit field sees it (a question can
 * select in several fields): this field's spans and pending selection.
 */
export interface FieldSpans extends SpanAnnotationState {
  /** The unit field (`text`): what spans record. */
  field: string;
}

/**
 * The spans of the field with this element id (`unit.text`; without one,
 * the question's first field). Null unless the span question on screen
 * selects in this field: the text then looks the same (the layout doesn't
 * shift) but can't be selected in.
 */
export function useFieldSpans(elementId: string | undefined): FieldSpans | null {
  const context = useSpanAnnotation();
  const own = elementId !== undefined ? elementId.replace(/^unit\./, "") : context?.fields[0];
  const ctx = context && own !== undefined && context.fields.includes(own) ? context : null;
  return useMemo(() => {
    if (!ctx || own === undefined) return null;
    return {
      ...ctx,
      field: own,
      spans: ctx.spans.filter((s) => s.field === own),
      pendingSpan: (ctx.pendingSpan?.field ?? ctx.fields[0]) === own ? ctx.pendingSpan : null,
      setPendingSpan: (p: PendingSpan | null) => ctx.setPendingSpan(p && { ...p, field: own }),
    };
  }, [ctx, own]);
}

/** The spans that cover the character at `offset`. */
export function spansAt(spans: SpanAnswer[], offset: number): SpanAnswer[] {
  return spans.filter((s) => s.slices.some((sl) => sl.offset <= offset && sl.offset + sl.length > offset));
}

/** Opens the menu of the spans on a clicked word (`SpanManageLabels`). */
export function openSpanMenu(field: FieldSpans, spans: SpanAnswer[]): void {
  field.setPendingSpan({
    slices: spans[0].slices,
    existingSpanIds: spans.map((s) => s.id),
    targetSpanId: undefined,
    mode: "manage",
  });
}

/** A new selection waiting for its label: the text from `start` to `end`. */
export function selectionOf(text: string, start: number, end: number): PendingSpan {
  return {
    slices: [{ offset: start, length: end - start, text: text.slice(start, end) }],
    anchorOffset: start,
    mode: "create",
  };
}
