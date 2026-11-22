import { PRIORITY } from "../keyboard/controller";
import { useKeyScope } from "../keyboard/hooks";
import { arrowDirection, type Direction } from "../keyboard/focus";
import React, { useRef, useCallback, useEffect, useMemo, useState } from "react";
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
  wordRanges,
  wordsSlice,
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

/** A Range over `root`'s text from character `start` to `end` (the text is split over several text nodes). */
function rangeOf(root: Node, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let total = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && start < total + length) {
      range.setStart(node, start - total);
      started = true;
    }
    if (started && end <= total + length) {
      range.setEnd(node, end - total);
      return range;
    }
    total += length;
  }
  return null;
}

/**
 * The word on the line above or below word `from` (the one nearest it
 * across), by where the words are on screen; `from` itself at the first or
 * last line.
 */
function wordOnNextLine(root: Node, words: readonly [number, number][], from: number, down: boolean): number {
  const rect = (i: number) => rangeOf(root, words[i][0], words[i][1])?.getBoundingClientRect();
  const current = rect(from);
  if (!current) return from;
  const middleY = current.top + current.height / 2;
  const middleX = current.left + current.width / 2;
  let best = from;
  let lineDistance = Infinity;
  let bestDx = Infinity;
  for (let i = down ? from + 1 : from - 1; down ? i < words.length : i >= 0; i += down ? 1 : -1) {
    const r = rect(i);
    if (!r) continue;
    const dy = down ? r.top + r.height / 2 - middleY : middleY - (r.top + r.height / 2);
    if (dy < current.height / 2) continue; // Still on this line
    if (lineDistance === Infinity) lineDistance = dy;
    else if (dy - lineDistance > current.height / 2) break; // Past the next line
    const dx = Math.abs(r.left + r.width / 2 - middleX);
    if (dx < bestDx) {
      best = i;
      bestDx = dx;
    }
  }
  return best;
}

/**
 * Focuses a new selection's first label button (SpanAnswerField's, or the
 * menu at the selection), and keeps it there for a few frames: the menu at
 * a selection that just began is still being replaced (it measures its
 * room, then mounts in a portal), which drops focus to the page. Stops when
 * focus went anywhere else, or the labels are gone.
 */
function focusLabels(frames = 20, seen = false): void {
  const active = document.activeElement;
  const onPage = !active || active === document.body;
  if (!onPage && !active?.hasAttribute("data-span-label")) return;
  const first = [...document.querySelectorAll<HTMLElement>("[data-span-label]")].find(
    (el) => el.getClientRects().length > 0,
  );
  // Labelled (or cancelled) since: done
  if (!first && seen) return;
  if (onPage && first) first.focus();
  if (frames > 0) requestAnimationFrame(() => focusLabels(frames - 1, seen || !!first));
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

  // The keyboard: the field it works in (the context's cursor: clicked last, else the first),
  // the word it is on, and while selecting the word the selection started at
  const words = useMemo(() => wordRanges(text), [text]);
  const keyboardField = annotation !== null && ctx !== null && own === (ctx.cursor?.field ?? ctx.fields[0]);
  const word = keyboardField ? (ctx?.cursor?.word ?? null) : null;
  const cursor =
    word === null || words.length === 0 ? null : word < 0 ? words.length - 1 : Math.min(word, words.length - 1);
  const setCursor = (next: number | null) => own !== undefined && ctx?.setCursor({ field: own, word: next });
  const [anchor, setAnchor] = useState<number | null>(null);
  // A selection that was cancelled or labelled ends the keyboard's selecting
  if (anchor !== null && !pending) setAnchor(null);
  // The other fields of the question, in order: the arrows go on into them
  const fieldIndex = ctx && own !== undefined ? ctx.fields.indexOf(own) : -1;

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

  // The keyboard in the text (see SpanSelectableText's description)
  useKeyScope(
    (press) => {
      if (!annotation || press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) return false;
      // Space or Enter on a focused button is the button's
      if (press.onControl) return false;
      const selecting = anchor !== null;
      // A selection waiting for its label: the keys are the labels' (the base keys move between them)
      if (pending && !selecting) return false;
      const direction: Direction | undefined = arrowDirection(press.key);
      if (direction) {
        const forward = direction === "right" || direction === "down";
        // At the first or last word (up and down: line), or in an empty text: on into the previous or next field
        const neighbour = ctx?.fields[fieldIndex + (forward ? 1 : -1)];
        if (!selecting && neighbour !== undefined) {
          const horizontal = direction === "left" || direction === "right";
          const atEdge =
            words.length === 0 ||
            (cursor !== null &&
              (horizontal
                ? cursor === (forward ? words.length - 1 : 0)
                : !!containerRef.current && wordOnNextLine(containerRef.current, words, cursor, forward) === cursor));
          if (atEdge) {
            ctx?.setCursor({ field: neighbour, word: forward ? 0 : -1 });
            return true;
          }
        }
        if (words.length === 0) return false;
        const at = cursor ?? -1;
        const next =
          at < 0
            ? 0
            : direction === "left"
              ? Math.max(0, at - 1)
              : direction === "right"
                ? Math.min(words.length - 1, at + 1)
                : containerRef.current
                  ? wordOnNextLine(containerRef.current, words, at, direction === "down")
                  : at;
        setCursor(next);
        if (selecting) {
          annotation.setPendingSpan({
            slices: [wordsSlice(text, words, anchor, next)],
            anchorOffset: words[Math.min(anchor, next)][0],
            mode: "create",
          });
        }
        return true;
      }
      if (press.key === " " && cursor !== null) {
        if (!selecting) {
          setAnchor(cursor);
          annotation.setPendingSpan({
            slices: [wordsSlice(text, words, cursor, cursor)],
            anchorOffset: words[cursor][0],
            mode: "create",
          });
        } else {
          // The selection is done: on to its label, once Space is up (released on a focused label, it would click it)
          setAnchor(null);
          window.addEventListener("keyup", () => requestAnimationFrame(() => focusLabels()), { once: true });
        }
        return true;
      }
      if (press.key === "Enter" && cursor !== null && !selecting) {
        const [start] = words[cursor];
        const covering = annotation.spans.filter((sp) =>
          sp.slices.some((sl) => sl.offset <= start && sl.offset + sl.length > start),
        );
        if (covering.length === 0) return false;
        openSpanMenu(covering);
        return true;
      }
      if (press.key === "Escape" && cursor !== null && !pending) {
        ctx?.setCursor(null);
        return true;
      }
      return false;
    },
    keyboardField,
    { priority: PRIORITY.field },
  );
  const cursorRange = cursor !== null && words[cursor] ? words[cursor] : null;

  // The keyboard's word stays in view
  useEffect(() => {
    containerRef.current?.querySelector("[data-cursor]")?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

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

  const segments = textSegments(text, annotation?.spans ?? [], pending, cursorRange ?? []);

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
    // The word the keyboard is on: an outline
    const atCursor = cursorRange !== null && seg.start >= cursorRange[0] && seg.end <= cursorRange[1];
    const cursorClass = atCursor ? "rounded-xs outline-2 outline-offset-1 outline-primary" : "";
    const cursorProps = atCursor ? { "data-cursor": "" } : {};
    if (seg.spans.length === 0) {
      return seg.isPending ? (
        <mark
          key={i}
          {...cursorProps}
          className={`rounded-xs bg-wood/25 text-foreground ring-2 ring-wood/70 ${cursorClass}`}
        >
          {content}
        </mark>
      ) : (
        <span key={i} {...cursorProps} className={cursorClass || undefined}>
          {content}
        </span>
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
        {...cursorProps}
        data-span-id={seg.spans.map((s) => s.id).join(" ")}
        style={style}
        title={title}
        onClick={(e) => handleSegmentClick(e, seg.spans)}
        className={`cursor-pointer font-normal transition-opacity hover:opacity-85 ${
          isFocused || seg.isPending ? "ring-2 ring-wood ring-offset-1 ring-offset-background" : ""
        } ${cursorClass}`}
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
        // Clicked: the keyboard works in this field from now on
        onMouseDown={
          annotation && own !== undefined && ctx?.cursor?.field !== own
            ? () => ctx?.setCursor({ field: own, word: null })
            : undefined
        }
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
