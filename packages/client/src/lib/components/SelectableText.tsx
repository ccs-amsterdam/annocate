import React, { useEffect, useRef, type RefObject } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import { useSpanAnnotation } from "../context/spanAnnotation";
import { useRelationAnnotation } from "../context/relationAnnotation";
import { PRIORITY } from "../keyboard/controller";
import { useKeyScope } from "../keyboard/hooks";
import type { Mark } from "../codebook/highlights";
import { RelationText } from "./RelationText";
import { SpanLabelMenu } from "./SpanLabelMenu";
import { textSegments, type Segment } from "./spanText";
import { openSpanMenu, useFieldSpans, type FieldSpans } from "./selectableText/fieldSpans";
import { TextSegment } from "./selectableText/TextSegment";
import { useMouseSelection } from "./selectableText/useMouseSelection";
import { useWordCursorKeys } from "./selectableText/useWordCursorKeys";

interface SelectableTextProps {
  text: string;
  field?: string;
  inline?: boolean;
  /** Highlighted words (the layout's highlights). */
  marks?: Mark[];
}

/**
 * A unit field a span question selects in (docs/client.md §4 "Span and
 * relation answers"): the text with its spans highlighted.
 *
 * - Nothing pending: clicking a word starts a selection of it, dragging
 *   selects a range, and clicking a span opens the menu of the spans there.
 * - A new selection waiting for its label: with gaps allowed, clicking or
 *   dragging toggles words; without, it moves the selection's end (its
 *   first word stays; clicks before it are ignored).
 * - The keyboard (in the field clicked last, else the first; the arrows go
 *   on into the question's next or previous field): the arrows move a cursor
 *   over the words (up and down: a line), Space starts a selection there,
 *   the arrows extend it, and Space again ends it; the label buttons then
 *   have focus (the arrows move between them, Space or Enter or their key
 *   chooses one, Esc cancels). Enter on a labelled word opens its spans.
 */
export function SelectableText({ text, field, inline = false, marks }: SelectableTextProps) {
  const spanContext = useSpanAnnotation();
  const relations = useRelationAnnotation();
  const own = field !== undefined ? field.replace(/^unit\./, "") : spanContext?.fields[0];
  // A relation question on screen: its spans to click (no span question selects here then)
  if (relations && own !== undefined && !spanContext?.fields.includes(own))
    return <RelationText text={text} field={own} inline={inline} />;
  return <SpanSelectableText text={text} field={field} inline={inline} marks={marks} />;
}

/**
 * The text a span question selects in (see SelectableText): with the mouse
 * (`useMouseSelection`) and the keyboard (`useWordCursorKeys`).
 */
function SpanSelectableText({ text, field, inline = false, marks }: SelectableTextProps) {
  const annotation = useFieldSpans(field);
  const containerRef = useRef<HTMLDivElement>(null);
  const pending = annotation?.pendingSpan ?? null;

  const processSelection = useMouseSelection(annotation, text, containerRef);
  const cursorRange = useWordCursorKeys(annotation, text, containerRef);
  useScrollToFocusedSpan(annotation?.focusedSpanId ?? null, containerRef);
  useRemoveLastSpanKey(annotation, containerRef);

  function handleKeyUp(e: React.KeyboardEvent) {
    if (e.shiftKey || e.key.startsWith("Arrow")) processSelection();
  }

  function handleSpanClick(e: React.MouseEvent, spans: SpanAnswer[]) {
    // Creating a span: mouseup (processSelection) extends or toggles it
    if (!annotation || pending?.mode === "create") return;
    e.stopPropagation();
    if (spans.length > 0) openSpanMenu(annotation, spans);
  }

  // Highlighted words (the layout's highlights) are cut apart too
  const markCuts = (marks ?? []).flatMap((m) => [m.start, m.end]);
  const segments = textSegments(text, annotation?.spans ?? [], pending, [...(cursorRange ?? []), ...markCuts]);
  const highlightOf = (seg: Segment) => marks?.find((m) => m.start <= seg.start && m.end >= seg.end);
  const atCursor = (seg: Segment) => cursorRange !== null && seg.start >= cursorRange[0] && seg.end <= cursorRange[1];
  // The labels for a new selection go right after its last part
  const lastPending = pending?.mode === "create" ? segments.findLastIndex((seg) => seg.isPending) : -1;

  const Container = inline ? "span" : "div";
  return (
    <Container className={inline ? undefined : "flex flex-col gap-2.5"}>
      {/* Interactive Text View */}
      <Container
        ref={containerRef as React.Ref<HTMLDivElement & HTMLSpanElement>}
        tabIndex={annotation ? 0 : undefined}
        // Clicked: the keyboard works in this field from now on
        onMouseDown={
          annotation && annotation.cursor?.field !== annotation.field
            ? () => annotation.setCursor({ field: annotation.field, word: null })
            : undefined
        }
        data-keys-own=""
        onKeyUp={annotation ? handleKeyUp : undefined}
        // The text being selected, the selection waiting for a label and the span being edited share one tint (wood)
        className="rounded p-1 leading-[1.8] whitespace-pre-wrap transition-all select-text selection:bg-wood/30 selection:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        {segments.map((seg, i) => (
          <React.Fragment key={i}>
            <TextSegment
              segment={seg}
              content={text.slice(seg.start, seg.end)}
              atCursor={atCursor(seg)}
              highlight={highlightOf(seg)}
              options={annotation?.options ?? []}
              focusedSpanId={annotation?.focusedSpanId ?? null}
              onSpanClick={handleSpanClick}
            />
            {i === lastPending && annotation && pending && (
              <SpanLabelMenu
                options={annotation.options}
                slices={pending.slices}
                onLabel={(value) => {
                  annotation.addSpan(pending.slices, value);
                  annotation.setPendingSpan(null);
                }}
                onCancel={() => annotation.setPendingSpan(null)}
              />
            )}
          </React.Fragment>
        ))}
      </Container>
    </Container>
  );
}

/** A span inspected from the labels list is scrolled into view. */
function useScrollToFocusedSpan(focusedSpanId: string | null, container: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!focusedSpanId || !container.current) return;
    const el = container.current.querySelector(`[data-span-id~="${focusedSpanId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedSpanId, container]);
}

/** Backspace / Delete, with the text focused: removes the last added span if nothing is pending. */
function useRemoveLastSpanKey(annotation: FieldSpans | null, container: RefObject<HTMLElement | null>): void {
  useKeyScope(
    (press) => {
      if (press.key !== "Backspace" && press.key !== "Delete") return false;
      if (!annotation || annotation.pendingSpan || annotation.spans.length === 0) return false;
      const el = container.current;
      if (!el || (el !== document.activeElement && !el.contains(document.activeElement))) return false;
      annotation.removeSpan(annotation.spans[annotation.spans.length - 1].id);
      return true;
    },
    !!annotation,
    { priority: PRIORITY.field },
  );
}
