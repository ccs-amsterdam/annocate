import { PRIORITY } from "../keyboard/controller";
import { useKeyScope } from "../keyboard/hooks";
import React, { useRef, useCallback, useEffect, useMemo } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import { useSpanAnnotation, type PendingSpan } from "../context/spanAnnotation";
import { useRelationAnnotation } from "../context/relationAnnotation";
import { RelationText } from "./RelationText";
import { getStackedUnderlineStyle } from "../utils/color";
import { SpanLabelMenu } from "./SpanLabelMenu";
import {
  getWordAtPosition,
  optionColor,
  optionLabelOf,
  snapToWord,
  spanSummary,
  textSegments,
  toggleSliceRange,
  type Segment,
} from "./spanText";

/**
 * A selection's position (a node and an offset in it, from `Range`) as a
 * character offset in `root`'s whole text, which is split over several
 * text nodes (the `<mark>`s of spans).
 */
function getAbsoluteOffset(root: Node, target: Node, offsetInTarget: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === target) return total + offsetInTarget;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return total;
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
 */
export function SelectableText({ text, field, inline = false }: { text: string; field?: string; inline?: boolean }) {
  const spanContext = useSpanAnnotation();
  const relations = useRelationAnnotation();
  const own = field !== undefined ? field.replace(/^unit\./, "") : spanContext?.fields[0];
  // A relation question on screen: its spans to click (no span question selects here then)
  if (relations && own !== undefined && !spanContext?.fields.includes(own))
    return <RelationText text={text} field={own} inline={inline} />;
  return <SpanSelectableText text={text} field={field} inline={inline} />;
}

/** The text a span question selects in (see SelectableText). */
function SpanSelectableText({ text, field, inline = false }: { text: string; field?: string; inline?: boolean }) {
  const context = useSpanAnnotation();
  // Only the span question on screen that selects in this field can select;
  // otherwise the text looks the same, so the layout doesn't shift.
  // `field` is the element's id (`unit.text`); spans record the unit field (`text`).
  const own = field !== undefined ? field.replace(/^unit\./, "") : context?.fields[0];
  const ctx = context && own !== undefined && context.fields.includes(own) ? context : null;
  // This field's spans and pending selection (a question can select in several fields).
  const annotation = useMemo(
    () =>
      ctx && {
        ...ctx,
        spans: ctx.spans.filter((s) => s.field === own),
        pendingSpan: (ctx.pendingSpan?.field ?? ctx.fields[0]) === own ? ctx.pendingSpan : null,
        setPendingSpan: (p: PendingSpan | null) => ctx.setPendingSpan(p && { ...p, field: own }),
      },
    [ctx, own],
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const pending = annotation?.pendingSpan ?? null;
  const options = annotation?.options ?? [];

  /** The menu of the spans on a clicked word (`SpanManageLabels`). */
  const openSpanMenu = useCallback(
    (spans: SpanAnswer[]) =>
      annotation?.setPendingSpan({
        slices: spans[0].slices,
        existingSpanIds: spans.map((s) => s.id),
        targetSpanId: undefined,
        mode: "manage",
      }),
    [annotation],
  );

  const processSelection = useCallback(() => {
    if (!annotation) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !containerRef.current) return;
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const a = getAbsoluteOffset(containerRef.current, range.startContainer, range.startOffset);
    const b = getAbsoluteOffset(containerRef.current, range.endContainer, range.endOffset);
    const [offset, end] = a <= b ? [a, b] : [b, a];
    const isClick = selection.isCollapsed || a === b;
    selection.removeAllRanges();

    // The text from `start` to `end`, as a new selection waiting for its label
    const startSelection = (start: number, stop: number) =>
      annotation.setPendingSpan({
        slices: [{ offset: start, length: stop - start, text: text.slice(start, stop) }],
        anchorOffset: start,
        mode: "create",
      });

    // While a new selection waits for its label, more text changes it: with
    // gaps allowed each word or range toggles; without, the selection runs
    // from its first word (`anchorOffset`) to the end of what was clicked or
    // dragged (a click before that first word is ignored).
    const changeSelection = (pending: PendingSpan, start: number, stop: number) => {
      if (annotation.allowGaps) {
        const slices = toggleSliceRange(text, pending.slices, { offset: start, length: stop - start });
        annotation.setPendingSpan(slices.length === 0 ? null : { ...pending, slices });
        return;
      }
      const anchor = pending.anchorOffset ?? pending.slices[0]?.offset ?? start;
      if (isClick && stop <= anchor) return;
      const newEnd = Math.max(anchor, stop);
      annotation.setPendingSpan({
        ...pending,
        anchorOffset: anchor,
        slices: [{ offset: anchor, length: newEnd - anchor, text: text.slice(anchor, newEnd) }],
      });
    };

    if (!isClick) {
      // A dragged range
      let [rangeStart, rangeEnd] = [offset, end];
      if (annotation.selectionMode === "word") [rangeStart, rangeEnd] = snapToWord(text, rangeStart, rangeEnd);
      if (rangeEnd <= rangeStart) return;
      if (pending?.mode === "create") changeSelection(pending, rangeStart, rangeEnd);
      else startSelection(rangeStart, rangeEnd);
      return;
    }

    // A click. In character mode no snapping: a click only opens an existing span (spans are made by selecting).
    const wordRange = annotation.selectionMode === "word" ? getWordAtPosition(text, offset) : null;
    if (pending?.mode === "create") {
      if (wordRange) changeSelection(pending, wordRange[0], wordRange[1]);
      return;
    }
    // On a labelled span: the menu of the spans there, always first
    const covering = annotation.spans.filter((s) =>
      s.slices.some((sl) => sl.offset <= offset && sl.offset + sl.length > offset),
    );
    if (covering.length > 0) {
      openSpanMenu(covering);
      return;
    }
    // On a word: a new selection of that word; elsewhere: close what was open
    if (wordRange) startSelection(wordRange[0], wordRange[1]);
    else annotation.setPendingSpan(null);
  }, [annotation, pending, text, openSpanMenu]);

  // On the document, not the text: a drag over an inline field (a headline
  // over two lines) can end between its line boxes. processSelection only
  // acts on a selection inside this text.
  const active = annotation !== null;
  useEffect(() => {
    if (!active) return;
    document.addEventListener("mouseup", processSelection);
    return () => document.removeEventListener("mouseup", processSelection);
  }, [active, processSelection]);

  function handleKeyUp(e: React.KeyboardEvent) {
    if (e.shiftKey || e.key.startsWith("Arrow")) {
      processSelection();
    }
  }

  // Scroll focused span into view when inspected from the labels list
  useEffect(() => {
    if (!annotation?.focusedSpanId || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-span-id~="${annotation.focusedSpanId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [annotation?.focusedSpanId]);

  // Backspace / Delete, with the text focused: remove the last added span if nothing is pending
  useKeyScope(
    (press) => {
      if (press.key !== "Backspace" && press.key !== "Delete") return false;
      if (!annotation || annotation.pendingSpan || annotation.spans.length === 0) return false;
      const container = containerRef.current;
      if (!container || (container !== document.activeElement && !container.contains(document.activeElement)))
        return false;
      annotation.removeSpan(annotation.spans[annotation.spans.length - 1].id);
      return true;
    },
    !!annotation,
    { priority: PRIORITY.field },
  );

  const segments = textSegments(text, annotation?.spans ?? [], pending);

  function handleSegmentClick(e: React.MouseEvent, spans: SpanAnswer[]) {
    // Creating a span: mouseup (processSelection) extends or toggles it
    if (annotation?.pendingSpan?.mode === "create") return;
    e.stopPropagation();
    if (spans.length > 0) openSpanMenu(spans);
  }

  // The labels for a new selection go right after its last part
  let lastPending = -1;
  if (pending?.mode === "create") segments.forEach((seg, i) => seg.isPending && (lastPending = i));

  function renderSegment(seg: Segment, i: number) {
    const content = text.slice(seg.start, seg.end);
    if (seg.spans.length === 0) {
      return seg.isPending ? (
        <mark key={i} className="rounded-xs bg-wood/25 text-foreground ring-2 ring-wood/70">
          {content}
        </mark>
      ) : (
        <span key={i}>{content}</span>
      );
    }
    // One span: its highlight; several overlapping: stacked colour bands
    const style = getStackedUnderlineStyle(
      seg.spans.map((s) => ({
        color: optionColor(options, s.value),
        isStart: s.slices.some((sl) => sl.offset === seg.start),
        isEnd: s.slices.some((sl) => sl.offset + sl.length === seg.end),
      })),
    );
    const title = seg.spans.map((s) => `${optionLabelOf(options, s.value)}: "${spanSummary(s.slices)}"`).join(", ");
    const isFocused = Boolean(annotation?.focusedSpanId && seg.spans.some((s) => s.id === annotation.focusedSpanId));
    return (
      <mark
        key={i}
        data-span-id={seg.spans.map((s) => s.id).join(" ")}
        style={style}
        title={`${title} (click to view labels)`}
        onClick={(e) => handleSegmentClick(e, seg.spans)}
        className={`cursor-pointer font-normal transition-opacity hover:opacity-85 ${
          isFocused || seg.isPending ? "ring-2 ring-wood ring-offset-1 ring-offset-background" : ""
        }`}
      >
        {content}
      </mark>
    );
  }

  const Container = inline ? "span" : "div";
  return (
    <Container className={inline ? undefined : "flex flex-col gap-2.5"}>
      {/* Interactive Text View */}
      <Container
        ref={containerRef as React.Ref<HTMLDivElement & HTMLSpanElement>}
        tabIndex={annotation ? 0 : undefined}
        data-keys-own=""
        onKeyUp={annotation ? handleKeyUp : undefined}
        // The text being selected, the selection waiting for a label and the span being edited share one tint (wood)
        className="rounded p-1 leading-[1.8] whitespace-pre-wrap transition-all select-text selection:bg-wood/30 selection:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        {segments.map((seg, i) => (
          <React.Fragment key={i}>
            {renderSegment(seg, i)}
            {i === lastPending && pending && (
              <SpanLabelMenu
                options={annotation!.options}
                slices={pending.slices}
                onLabel={(value) => {
                  annotation!.addSpan(pending.slices, value);
                  annotation!.setPendingSpan(null);
                }}
                onCancel={() => annotation!.setPendingSpan(null)}
              />
            )}
          </React.Fragment>
        ))}
      </Container>
    </Container>
  );
}
