import { useRef, useState, useEffect, useCallback } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import { useSpanAnnotation } from "../context/SpanAnnotationContext";
import {
  getSpanHighlightStyle,
  getMultiSpanHighlightStyle,
  getCodeButtonStyle,
  getCodeBadgeStyle,
} from "../utils/color";
import { X, Layers } from "lucide-react";

/**
 * Snaps raw character offsets to word boundaries when in "word" selection mode.
 * Expands start backwards to the beginning of the word and end forwards to the
 * end of the word, trimming leading/trailing whitespace.
 */
export function snapToWord(text: string, rawStart: number, rawEnd: number): [number, number] {
  if (rawStart >= rawEnd || text.length === 0) return [rawStart, rawEnd];
  const isWordChar = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);

  let start = Math.max(0, Math.min(rawStart, text.length));
  let end = Math.max(0, Math.min(rawEnd, text.length));

  // Expand start backwards to word beginning
  while (start > 0 && isWordChar(text[start - 1])) {
    start--;
  }

  // Expand end forwards to word ending
  while (end < text.length && isWordChar(text[end])) {
    end++;
  }

  // Trim leading whitespace
  while (start < end && /\s/.test(text[start])) {
    start++;
  }
  // Trim trailing whitespace
  while (end > start && /\s/.test(text[end - 1])) {
    end--;
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
 * `SpanAnnotationContext`) highlighted, and lets the coder select spans
 * by dragging over the text or using keyboard navigation.
 *
 * Features:
 * - Word vs Character selection mode (snaps to words or allows exact chars)
 * - Multiple overlapping spans on the same piece of text (rendered with multi-color gradient)
 * - Keyboard navigation (hotkeys 1-9 for codes, w for mode toggle, Esc, Backspace/Delete)
 */
export function SelectableText({ text }: { text: string }) {
  const annotation = useSpanAnnotation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{ offset: number; length: number } | null>(null);
  const [activeSegmentSpans, setActiveSegmentSpans] = useState<SpanAnswer[] | null>(null);

  const processSelection = useCallback(() => {
    if (!annotation) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !containerRef.current) return;
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const a = getAbsoluteOffset(containerRef.current, range.startContainer, range.startOffset);
    const b = getAbsoluteOffset(containerRef.current, range.endContainer, range.endOffset);
    let [offset, end] = a <= b ? [a, b] : [b, a];
    selection.removeAllRanges();
    if (end <= offset) return;

    if (annotation.selectionMode === "word") {
      [offset, end] = snapToWord(text, offset, end);
    }

    if (end <= offset) return;

    setActiveSegmentSpans(null);
    setPending({ offset, length: end - offset });
  }, [annotation, text]);

  function handleMouseUp() {
    processSelection();
  }

  function handleKeyUp(e: React.KeyboardEvent) {
    // If Shift + Arrow selection completed via keyboard
    if (e.shiftKey || e.key.startsWith("Arrow")) {
      processSelection();
    }
  }

  const assignCode = useCallback(
    (code: string) => {
      if (!annotation || !pending) return;
      annotation.addSpan(
        pending.offset,
        pending.length,
        code,
        text.slice(pending.offset, pending.offset + pending.length),
      );
      setPending(null);
    },
    [annotation, pending, text],
  );

  // Global hotkeys when pending selection is active (1-9 to pick code, Esc to cancel)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!annotation) return;

      // When code picker is open:
      if (pending) {
        if (e.key === "Escape") {
          e.preventDefault();
          setPending(null);
          return;
        }
        if (e.key === "Enter" && annotation.codes.length > 0) {
          e.preventDefault();
          assignCode(annotation.codes[0].code);
          return;
        }
        // Number hotkeys 1-9
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= annotation.codes.length) {
          e.preventDefault();
          assignCode(annotation.codes[num - 1].code);
          return;
        }
      }

      // If typing inside an input/textarea, ignore general shortcuts
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      // Hotkey 'w': toggle word / character selection mode
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        annotation.setSelectionMode(annotation.selectionMode === "word" ? "character" : "word");
        return;
      }

      // Backspace / Delete: remove last added span if nothing pending
      if ((e.key === "Backspace" || e.key === "Delete") && !pending && annotation.spans.length > 0) {
        // If container has focus or body has focus
        if (
          containerRef.current?.contains(document.activeElement) ||
          document.activeElement === document.body
        ) {
          const lastSpan = annotation.spans[annotation.spans.length - 1];
          annotation.removeSpan(lastSpan.id);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotation, pending, assignCode]);

  if (!annotation) return <span className="whitespace-pre-wrap">{text}</span>;

  // Build sorted, non-overlapping segments covering all overlapping spans
  const cutPoints = new Set<number>([0, text.length]);
  for (const span of annotation.spans) {
    cutPoints.add(Math.max(0, Math.min(span.offset, text.length)));
    cutPoints.add(Math.max(0, Math.min(span.offset + span.length, text.length)));
  }
  const sortedPoints = Array.from(cutPoints).sort((a, b) => a - b);

  const segments: { start: number; end: number; spans: SpanAnswer[] }[] = [];
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const start = sortedPoints[i];
    const end = sortedPoints[i + 1];
    if (start >= end) continue;
    const coveringSpans = annotation.spans.filter((s) => s.offset <= start && s.offset + s.length >= end);
    segments.push({ start, end, spans: coveringSpans });
  }

  function colorFor(code: string): string | undefined {
    return annotation?.codes.find((c) => c.code === code)?.color;
  }

  function handleSegmentClick(spans: SpanAnswer[]) {
    if (spans.length === 1) {
      annotation?.removeSpan(spans[0].id);
      setActiveSegmentSpans(null);
    } else if (spans.length > 1) {
      setActiveSegmentSpans(spans);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Interactive Text View */}
      <div
        ref={containerRef}
        tabIndex={0}
        onMouseUp={handleMouseUp}
        onKeyUp={handleKeyUp}
        className="whitespace-pre-wrap select-text focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded p-1 transition-all"
      >
        {segments.map((seg, i) => {
          if (seg.spans.length === 0) {
            return <span key={i}>{text.slice(seg.start, seg.end)}</span>;
          }

          if (seg.spans.length === 1) {
            const span = seg.spans[0];
            return (
              <mark
                key={i}
                style={getSpanHighlightStyle(colorFor(span.code))}
                title={`${span.code} (click to remove)`}
                onClick={() => handleSegmentClick(seg.spans)}
                className="cursor-pointer transition-opacity hover:opacity-80"
              >
                {text.slice(seg.start, seg.end)}
              </mark>
            );
          }

          // Multiple overlapping spans on this segment
          const colors = seg.spans.map((s) => colorFor(s.code));
          const titles = seg.spans.map((s) => s.code).join(", ");
          return (
            <mark
              key={i}
              style={getMultiSpanHighlightStyle(colors)}
              title={`Overlapping spans: [${titles}] (click to manage)`}
              onClick={() => handleSegmentClick(seg.spans)}
              className="cursor-pointer font-medium transition-opacity hover:opacity-80"
            >
              {text.slice(seg.start, seg.end)}
            </mark>
          );
        })}
      </div>

      {/* Overlapping Spans Management Popover / Bar */}
      {activeSegmentSpans && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs shadow-xs animate-in fade-in">
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Overlapping spans:
          </span>
          {activeSegmentSpans.map((s) => {
            const badgeStyle = getCodeBadgeStyle(colorFor(s.code));
            return (
              <span
                key={s.id}
                style={badgeStyle}
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium"
              >
                <strong>{s.code}</strong>
                <button
                  type="button"
                  onClick={() => {
                    annotation.removeSpan(s.id);
                    setActiveSegmentSpans((prev) => (prev ? prev.filter((item) => item.id !== s.id) : null));
                  }}
                  className="rounded p-0.5 hover:bg-black/10 transition-colors cursor-pointer"
                  title="Remove this span"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline ml-auto cursor-pointer"
            onClick={() => setActiveSegmentSpans(null)}
          >
            close
          </button>
        </div>
      )}

      {/* Pending Selection Code Assignment Bar with Hotkey Badges */}
      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-sm shadow-md animate-in fade-in">
          <span className="text-xs font-semibold text-muted-foreground">Assign code:</span>
          {annotation.codes.map((c, idx) => (
            <button
              key={c.code}
              type="button"
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer"
              style={getCodeButtonStyle(c.color, false)}
              onClick={() => assignCode(c.code)}
            >
              {idx < 9 && (
                <kbd className="rounded bg-black/10 px-1 py-0.2 text-[10px] font-mono text-muted-foreground">
                  {idx + 1}
                </kbd>
              )}
              <span>{c.code}</span>
            </button>
          ))}
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground ml-auto cursor-pointer"
            onClick={() => setPending(null)}
          >
            cancel (Esc)
          </button>
        </div>
      )}
    </div>
  );
}
