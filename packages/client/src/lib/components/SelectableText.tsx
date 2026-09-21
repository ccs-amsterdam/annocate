import React, { useRef, useCallback, useEffect } from "react";
import type { SpanAnswer, SpanSlice } from "@annotinder/contracts";
import { useSpanAnnotation } from "../context/SpanAnnotationContext";
import { getSpanHighlightStyle, getStackedUnderlineStyle } from "../utils/color";

/**
 * Truncates span text with an ellipsis in the middle if it exceeds maxLength.
 * Useful for keeping badge titles and summary chips compact and legible.
 */
export function truncateSpanText(text: string, maxLength = 30): string {
  if (text.length <= maxLength) return text;
  const charsToShow = maxLength - 1; // 1 for '…'
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return `${text.slice(0, frontChars).trimEnd()}…${text.slice(-backChars).trimStart()}`;
}

/**
 * Snaps arbitrary character start/end offsets to word boundaries,
 * following the standard natural text selection expectation.
 */
export function snapToWord(text: string, start: number, end: number): [number, number] {
  if (start >= end) return [start, end];

  // Expand start backwards to word boundary (non-whitespace)
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }

  // Expand end forwards to word boundary (non-whitespace)
  while (end < text.length && !/\s/.test(text[end])) {
    end++;
  }

  // Trim leading/trailing whitespace if any crept in
  while (start < end && /\s/.test(text[start])) {
    start++;
  }
  while (end > start && /\s/.test(text[end - 1])) {
    end--;
  }

  return [start, end];
}

/**
 * Trims leading and trailing whitespace from a character range.
 */
export function trimRangeWhitespace(
  text: string,
  offset: number,
  length: number,
): { offset: number; length: number } {
  let start = offset;
  let end = offset + length;
  while (start < end && /\s/.test(text[start])) {
    start++;
  }
  while (end > start && /\s/.test(text[end - 1])) {
    end--;
  }
  return { offset: start, length: Math.max(0, end - start) };
}

/**
 * Merges overlapping or directly adjacent slices and extracts their text from `text`.
 */
export function mergeSpanSlices(
  text: string,
  slices: Array<{ offset: number; length: number }>,
): SpanSlice[] {
  if (slices.length === 0) return [];
  const sorted = [...slices].sort((a, b) => a.offset - b.offset);
  const merged: Array<{ offset: number; length: number }> = [];

  for (const raw of sorted) {
    const trimmed = trimRangeWhitespace(text, raw.offset, raw.length);
    if (trimmed.length === 0) continue;

    if (merged.length === 0) {
      merged.push({ ...trimmed });
      continue;
    }
    const last = merged[merged.length - 1];
    // If overlapping, touching, or separated only by whitespace, merge them
    const between = text.slice(last.offset + last.length, trimmed.offset);
    const isWhitespaceOnly = /^\s*$/.test(between);
    if (trimmed.offset <= last.offset + last.length || isWhitespaceOnly) {
      const newEnd = Math.max(last.offset + last.length, trimmed.offset + trimmed.length);
      last.length = newEnd - last.offset;
    } else {
      merged.push({ ...trimmed });
    }
  }

  return merged.map((m) => ({
    offset: m.offset,
    length: m.length,
    text: text.slice(m.offset, m.offset + m.length),
  }));
}

/**
 * Toggles a range on or off within a set of slices.
 * If range overlaps any current slice, it removes that range (splitting or shortening slices).
 * If range does not overlap, it adds that range and merges any touching slices.
 */
export function toggleSliceRange(
  text: string,
  currentSlices: SpanSlice[],
  range: { offset: number; length: number },
): SpanSlice[] {
  const trimmed = trimRangeWhitespace(text, range.offset, range.length);
  if (trimmed.length === 0) return currentSlices;
  const rStart = trimmed.offset;
  const rEnd = trimmed.offset + trimmed.length;

  const overlaps = currentSlices.some(
    (s) => rStart < s.offset + s.length && s.offset < rEnd,
  );

  if (overlaps) {
    // Toggle OFF: subtract range from slices
    const newRanges: Array<{ offset: number; length: number }> = [];
    for (const s of currentSlices) {
      const sStart = s.offset;
      const sEnd = s.offset + s.length;
      if (rEnd <= sStart || rStart >= sEnd) {
        // No overlap
        newRanges.push({ offset: sStart, length: s.length });
      } else {
        // Overlap: keep parts before and after
        if (sStart < rStart) {
          newRanges.push({ offset: sStart, length: rStart - sStart });
        }
        if (sEnd > rEnd) {
          newRanges.push({ offset: rEnd, length: sEnd - rEnd });
        }
      }
    }
    return newRanges
      .map((r) => trimRangeWhitespace(text, r.offset, r.length))
      .filter((r) => r.length > 0)
      .map((r) => ({
        offset: r.offset,
        length: r.length,
        text: text.slice(r.offset, r.offset + r.length),
      }));
  } else {
    // Toggle ON: add and merge
    return mergeSpanSlices(text, [...currentSlices, trimmed]);
  }
}

/**
 * Finds the word boundaries at a given character offset in `text`.
 */
export function getWordAtPosition(text: string, offset: number): [number, number] | null {
  if (offset < 0 || offset >= text.length) return null;

  // If clicked directly on whitespace, look right or left for nearest word
  if (/\s/.test(text[offset])) {
    if (offset + 1 < text.length && !/\s/.test(text[offset + 1])) {
      offset = offset + 1;
    } else if (offset > 0 && !/\s/.test(text[offset - 1])) {
      offset = offset - 1;
    } else {
      return null;
    }
  }

  let start = offset;
  let end = offset;

  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }
  while (end < text.length && !/\s/.test(text[end])) {
    end++;
  }

  return [start, end];
}

/** Walks all text nodes under `root`, summing lengths, to turn a DOM
 * (node, offsetInNode) position (as reported by `Selection`/`Range`) into a
 * single character offset into `root`'s full text content. Robust to the
 * text being split across multiple text nodes (e.g. existing `<mark>`
 * spans), unlike naively trusting `range.startOffset`. */
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
 * Renders `text` as plain content, with any already-created spans (from
 * `SpanAnnotationContext`) highlighted, and lets the coder select or click spans.
 *
 * Interaction rules:
 * - When in span create mode:
 *   - If gaps are allowed (`allowGaps: true`): Tapping or selecting words becomes an on/off switch.
 *   - If gaps are not allowed (`allowGaps: false`): The start word is a fixed anchor. Subsequent taps
 *     change the end boundary, enabling shrinking/unselecting. Taps before anchor are ignored.
 * - When idle:
 *   - Clicking an empty word starts a span selection for that word.
 *   - Clicking an existing label opens the manage menu for that word (showing current labels + "Create new label").
 *   - Dragging across text creates a range selection.
 */
export function SelectableText({ text }: { text: string }) {
  const annotation = useSpanAnnotation();
  const containerRef = useRef<HTMLDivElement>(null);

  const pending = annotation?.pendingSpan ?? null;

  const processSelection = useCallback(() => {
    if (!annotation) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !containerRef.current) return;
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const a = getAbsoluteOffset(containerRef.current, range.startContainer, range.startOffset);
    const b = getAbsoluteOffset(containerRef.current, range.endContainer, range.endOffset);
    let [offset, end] = a <= b ? [a, b] : [b, a];
    const isClick = selection.isCollapsed || a === b;
    selection.removeAllRanges();

    if (isClick) {
      const caret = offset;
      const wordRange = getWordAtPosition(text, caret);

      // Case 1: If a span is ALREADY pending in create mode:
      if (pending && pending.mode === "create") {
        if (!wordRange) return;
        const [wStart, wEnd] = wordRange;

        if (annotation.allowGaps) {
          // Gaps ARE allowed: tapping words is an on/off switch!
          const newSlices = toggleSliceRange(text, pending.slices, {
            offset: wStart,
            length: wEnd - wStart,
          });
          if (newSlices.length === 0) {
            annotation.setPendingSpan(null);
          } else {
            annotation.setPendingSpan({
              ...pending,
              slices: newSlices,
            });
          }
        } else {
          // Gaps NOT allowed:
          // Keep anchorOffset fixed. When another word is clicked:
          // - Selecting points BEFORE the anchor is ignored
          // - Selecting points AFTER the anchor changes the end point to that point
          const anchor = pending.anchorOffset ?? pending.slices[0]?.offset ?? wStart;
          if (wEnd <= anchor) {
            // Clicked before anchor: ignored as requested
            return;
          }
          const newLength = wEnd - anchor;
          annotation.setPendingSpan({
            ...pending,
            anchorOffset: anchor,
            slices: [
              {
                offset: anchor,
                length: newLength,
                text: text.slice(anchor, wEnd),
              },
            ],
          });
        }
        return;
      }

      // Case 2: Clicked on an existing labeled span -> Always open the menu first!
      const covering = annotation.spans.filter((s) =>
        s.slices.some((sl) => sl.offset <= caret && sl.offset + sl.length > caret),
      );
      if (covering.length > 0) {
        const firstSpan = covering[0];
        annotation.setPendingSpan({
          slices: firstSpan.slices,
          existingSpanIds: covering.map((s) => s.id),
          targetSpanId: undefined, // Never bypass the menu!
          mode: "manage",
        });
        return;
      }

      // Case 3: Clicked on an empty word: start a new span selection for that word!
      if (wordRange) {
        const [wStart, wEnd] = wordRange;
        annotation.setPendingSpan({
          slices: [
            {
              offset: wStart,
              length: wEnd - wStart,
              text: text.slice(wStart, wEnd),
            },
          ],
          anchorOffset: wStart,
          mode: "create",
        });
        return;
      }

      // Clicked on empty space with no word: dismiss any open form
      annotation.setPendingSpan(null);
      return;
    } else {
      // Dragged range selection
      let [rangeStart, rangeEnd] = [offset, end];
      if (annotation.selectionMode === "word") {
        [rangeStart, rangeEnd] = snapToWord(text, rangeStart, rangeEnd);
      }
      if (rangeEnd <= rangeStart) return;

      if (pending && pending.mode === "create") {
        if (annotation.allowGaps) {
          const newSlices = toggleSliceRange(text, pending.slices, {
            offset: rangeStart,
            length: rangeEnd - rangeStart,
          });
          if (newSlices.length === 0) {
            annotation.setPendingSpan(null);
          } else {
            annotation.setPendingSpan({
              ...pending,
              slices: newSlices,
            });
          }
        } else {
          const anchor = pending.anchorOffset ?? pending.slices[0]?.offset ?? rangeStart;
          const newEnd = Math.max(anchor, rangeEnd);
          annotation.setPendingSpan({
            ...pending,
            anchorOffset: anchor,
            slices: [
              {
                offset: anchor,
                length: newEnd - anchor,
                text: text.slice(anchor, newEnd),
              },
            ],
          });
        }
      } else {
        annotation.setPendingSpan({
          slices: [
            {
              offset: rangeStart,
              length: rangeEnd - rangeStart,
              text: text.slice(rangeStart, rangeEnd),
            },
          ],
          anchorOffset: rangeStart,
          mode: "create",
        });
      }
    }
  }, [annotation, pending, text]);

  function handleMouseUp() {
    processSelection();
  }

  function handleKeyUp(e: React.KeyboardEvent) {
    if (e.shiftKey || e.key.startsWith("Arrow")) {
      processSelection();
    }
  }


  // Scroll focused span into view when inspected from the labels list
  useEffect(() => {
    if (!annotation?.focusedSpanId || !containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-span-id~="${annotation.focusedSpanId}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [annotation?.focusedSpanId]);

  // Backspace / Delete: remove last added span if nothing pending
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!annotation) return;

      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if ((e.key === "Backspace" || e.key === "Delete") && !annotation.pendingSpan && annotation.spans.length > 0) {
        if (
          containerRef.current &&
          (containerRef.current === document.activeElement ||
            containerRef.current.contains(document.activeElement))
        ) {
          e.preventDefault();
          const last = annotation.spans[annotation.spans.length - 1];
          annotation.removeSpan(last.id);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotation]);

  // Compute text segments (unannotated, single-span, or overlapping multi-span)
  const cuts = new Set<number>([0, text.length]);
  if (pending) {
    for (const slice of pending.slices) {
      cuts.add(Math.max(0, Math.min(text.length, slice.offset)));
      cuts.add(Math.max(0, Math.min(text.length, slice.offset + slice.length)));
    }
  }
  for (const s of annotation?.spans ?? []) {
    for (const slice of s.slices) {
      cuts.add(Math.max(0, Math.min(text.length, slice.offset)));
      cuts.add(Math.max(0, Math.min(text.length, slice.offset + slice.length)));
    }
  }
  const sortedCuts = Array.from(cuts).sort((x, y) => x - y);

  const segments: Array<{
    start: number;
    end: number;
    spans: SpanAnswer[];
    isPending: boolean;
  }> = [];

  for (let i = 0; i < sortedCuts.length - 1; i++) {
    const start = sortedCuts[i];
    const end = sortedCuts[i + 1];
    if (start >= end) continue;

    const covering = (annotation?.spans ?? []).filter((s) =>
      s.slices.some((slice) => slice.offset <= start && slice.offset + slice.length >= end),
    );
    const isPending = Boolean(
      pending &&
        pending.slices.some((slice) => slice.offset <= start && slice.offset + slice.length >= end),
    );
    segments.push({ start, end, spans: covering, isPending });
  }

  function colorFor(code: string): string | undefined {
    return annotation?.codes.find((c) => c.code === code)?.color;
  }

  function handleSegmentClick(e: React.MouseEvent, spans: SpanAnswer[]) {
    // If currently creating a span, clicking on a labeled segment extends/toggles the span
    if (annotation?.pendingSpan && annotation.pendingSpan.mode === "create") {
      return; // Let mouseup/processSelection handle creating/toggling
    }

    e.stopPropagation();
    if (!annotation || spans.length === 0) return;
    const firstSpan = spans[0];
    annotation.setPendingSpan({
      slices: firstSpan.slices,
      existingSpanIds: spans.map((s) => s.id),
      targetSpanId: undefined, // Always show the menu first!
      mode: "manage",
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Interactive Text View */}
      <div
        ref={containerRef}
        tabIndex={0}
        onMouseUp={handleMouseUp}
        onKeyUp={handleKeyUp}
        className="whitespace-pre-wrap select-text focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded p-1 transition-all leading-[1.8]"
      >
        {segments.map((seg, i) => {
          if (seg.spans.length === 0) {
            if (seg.isPending) {
              return (
                <mark
                  key={i}
                  className="bg-primary/25 text-primary font-medium rounded-xs px-0.5 ring-2 ring-primary/60 animate-pulse"
                >
                  {text.slice(seg.start, seg.end)}
                </mark>
              );
            }
            return <span key={i}>{text.slice(seg.start, seg.end)}</span>;
          }

          if (seg.spans.length === 1) {
            const span = seg.spans[0];
            const isStart = span.slices.some((sl) => sl.offset === seg.start);
            const isEnd = span.slices.some((sl) => sl.offset + sl.length === seg.end);
            const spanSummary = span.slices.map((sl) => sl.text).join(" ... ");
            return (
              <mark
                key={i}
                style={getSpanHighlightStyle({ color: colorFor(span.code), isStart, isEnd })}
                title={`${span.code}: "${spanSummary}" (click to view labels)`}
                onClick={(e) => handleSegmentClick(e, seg.spans)}
                className={`cursor-pointer transition-opacity hover:opacity-85 font-normal ${
                  seg.isPending ? "ring-2 ring-primary/80 ring-offset-1" : ""
                }`}
              >
                {text.slice(seg.start, seg.end)}
              </mark>
            );
          }

          // Multiple overlapping spans on this segment
          const spansInfo = seg.spans.map((s) => ({
            color: colorFor(s.code),
            isStart: s.slices.some((sl) => sl.offset === seg.start),
            isEnd: s.slices.some((sl) => sl.offset + sl.length === seg.end),
          }));
          const stackedStyle = getStackedUnderlineStyle(spansInfo);
          const title = seg.spans
            .map((s) => `${s.code}: "${s.slices.map((sl) => sl.text).join(" ... ")}"`)
            .join(", ");

          const isFocused = Boolean(
            annotation?.focusedSpanId && seg.spans.some((s) => s.id === annotation.focusedSpanId),
          );
          return (
            <mark
              key={i}
              data-span-id={seg.spans.map((s) => s.id).join(" ")}
              style={stackedStyle}
              title={`${title} (click to view labels)`}
              onClick={(e) => handleSegmentClick(e, seg.spans)}
              className={`cursor-pointer transition-opacity hover:opacity-85 font-normal ${
                seg.isPending ? "ring-2 ring-primary/80 ring-offset-1" : ""
              } ${isFocused ? "ring-2 ring-foreground/90 ring-offset-2 animate-pulse" : ""}`}
            >
              {text.slice(seg.start, seg.end)}
            </mark>
          );
        })}
      </div>
    </div>
  );
}
