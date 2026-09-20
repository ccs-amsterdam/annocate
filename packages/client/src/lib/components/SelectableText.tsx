import React, { useRef, useCallback, useEffect } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
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
 * - When in span create mode: clicking another word extends the span to encompass it.
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

      // Case 1: If a span is ALREADY pending in create mode, clicking another word extends the span!
      if (pending && pending.mode === "create" && wordRange) {
        const [wStart, wEnd] = wordRange;
        const newStart = Math.min(pending.offset, wStart);
        const newEnd = Math.max(pending.offset + pending.length, wEnd);
        annotation.setPendingSpan({
          offset: newStart,
          length: newEnd - newStart,
          text: text.slice(newStart, newEnd),
          mode: "create",
        });
        return;
      }

      // Case 2: Clicked on an existing labeled span -> Always open the menu first!
      const covering = annotation.spans.filter((s) => s.offset <= caret && s.offset + s.length > caret);
      if (covering.length > 0) {
        const firstSpan = covering[0];
        annotation.setPendingSpan({
          offset: firstSpan.offset,
          length: firstSpan.length,
          text: firstSpan.text,
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
          offset: wStart,
          length: wEnd - wStart,
          text: text.slice(wStart, wEnd),
          mode: "create",
        });
        return;
      }

      // Clicked on empty space with no word: dismiss any open form
      annotation.setPendingSpan(null);
      return;
    } else {
      // Dragged range selection: creating a new label!
      if (annotation.selectionMode === "word") {
        [offset, end] = snapToWord(text, offset, end);
      }
    }

    if (end <= offset) return;

    annotation.setPendingSpan({
      offset,
      length: end - offset,
      text: text.slice(offset, end),
      mode: "create",
    });
  }, [annotation, pending, text]);

  function handleMouseUp() {
    processSelection();
  }

  function handleKeyUp(e: React.KeyboardEvent) {
    if (e.shiftKey || e.key.startsWith("Arrow")) {
      processSelection();
    }
  }

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
    cuts.add(Math.max(0, Math.min(text.length, pending.offset)));
    cuts.add(Math.max(0, Math.min(text.length, pending.offset + pending.length)));
  }
  for (const s of annotation?.spans ?? []) {
    cuts.add(Math.max(0, Math.min(text.length, s.offset)));
    cuts.add(Math.max(0, Math.min(text.length, s.offset + s.length)));
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

    const covering = (annotation?.spans ?? []).filter(
      (s) => s.offset <= start && s.offset + s.length >= end,
    );
    const isPending = Boolean(
      pending && pending.offset <= start && pending.offset + pending.length >= end,
    );
    segments.push({ start, end, spans: covering, isPending });
  }

  function colorFor(code: string): string | undefined {
    return annotation?.codes.find((c) => c.code === code)?.color;
  }

  function handleSegmentClick(e: React.MouseEvent, spans: SpanAnswer[]) {
    // If currently creating a span, clicking on a labeled segment extends the span!
    if (annotation?.pendingSpan && annotation.pendingSpan.mode === "create") {
      return; // Let mouseup/processSelection handle extending the span
    }

    e.stopPropagation();
    if (!annotation || spans.length === 0) return;
    const firstSpan = spans[0];
    annotation.setPendingSpan({
      offset: firstSpan.offset,
      length: firstSpan.length,
      text: firstSpan.text,
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
            const isStart = seg.start === span.offset;
            const isEnd = seg.end === span.offset + span.length;
            return (
              <mark
                key={i}
                style={getSpanHighlightStyle({ color: colorFor(span.code), isStart, isEnd })}
                title={`${span.code}: \"${span.text}\" (click to view labels)`}
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
            isStart: seg.start === s.offset,
            isEnd: seg.end === s.offset + s.length,
          }));
          const stackedStyle = getStackedUnderlineStyle(spansInfo);
          const title = seg.spans.map((s) => `${s.code}: \"${s.text}\"`).join(", ");

          return (
            <mark
              key={i}
              style={stackedStyle}
              title={`${title} (click to view labels)`}
              onClick={(e) => handleSegmentClick(e, seg.spans)}
              className={`cursor-pointer transition-opacity hover:opacity-85 font-normal ${
                seg.isPending ? "ring-2 ring-primary/80 ring-offset-1" : ""
              }`}
            >
              {text.slice(seg.start, seg.end)}
            </mark>
          );
        })}
      </div>
    </div>
  );
}
