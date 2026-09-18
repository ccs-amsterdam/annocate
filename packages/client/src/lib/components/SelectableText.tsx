import { useRef, useState } from "react";
import { useSpanAnnotation } from "../context/SpanAnnotationContext";

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
 * `SpanAnnotationContext`) highlighted, and lets the coder select a new
 * span by dragging over the text (design plan §11b: character-offset spans,
 * no tokenizer). A small inline code picker appears below the text once a
 * selection is made; picking a code commits the span via `addSpan`.
 */
export function SelectableText({ text }: { text: string }) {
  const annotation = useSpanAnnotation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{ offset: number; length: number } | null>(null);

  if (!annotation) return <span className="whitespace-pre-wrap">{text}</span>;

  const spans = [...annotation.spans].sort((a, b) => a.offset - b.offset);

  const segments: { start: number; end: number; code?: string }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.offset > cursor) segments.push({ start: cursor, end: span.offset });
    segments.push({ start: span.offset, end: span.offset + span.length, code: span.code });
    cursor = span.offset + span.length;
  }
  if (cursor < text.length) segments.push({ start: cursor, end: text.length });

  function handleMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !containerRef.current) return;
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const a = getAbsoluteOffset(containerRef.current, range.startContainer, range.startOffset);
    const b = getAbsoluteOffset(containerRef.current, range.endContainer, range.endOffset);
    const [offset, end] = a <= b ? [a, b] : [b, a];
    selection.removeAllRanges();
    if (end > offset) setPending({ offset, length: end - offset });
  }

  function colorFor(code: string): string {
    return annotation?.codes.find((c) => c.code === code)?.color ?? "#fde68a";
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} onMouseUp={handleMouseUp} className="whitespace-pre-wrap select-text">
        {segments.map((seg, i) =>
          seg.code ? (
            <mark key={i} style={{ backgroundColor: colorFor(seg.code) }} title={seg.code}>
              {text.slice(seg.start, seg.end)}
            </mark>
          ) : (
            <span key={i}>{text.slice(seg.start, seg.end)}</span>
          ),
        )}
      </div>
      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded border bg-muted/50 p-2 text-sm">
          <span className="text-muted-foreground">Assign code to selection:</span>
          {annotation.codes.map((c) => (
            <button
              key={c.code}
              type="button"
              className="rounded border px-2 py-0.5 hover:bg-muted"
              style={{ backgroundColor: c.color }}
              onClick={() => {
                annotation.addSpan(
                  pending.offset,
                  pending.length,
                  c.code,
                  text.slice(pending.offset, pending.offset + pending.length),
                );
                setPending(null);
              }}
            >
              {c.code}
            </button>
          ))}
          <button type="button" className="text-muted-foreground underline" onClick={() => setPending(null)}>
            cancel
          </button>
        </div>
      )}
    </div>
  );
}
