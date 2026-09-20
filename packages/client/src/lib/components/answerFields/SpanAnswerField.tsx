import type { AnswerFieldProps, QuestionVariable } from "./types";
import { Button } from "@/components/ui/button";
import { useSpanAnnotation } from "../../context/SpanAnnotationContext";
import { getCodeBadgeStyle } from "../../utils/color";
import { X, Type } from "lucide-react";

type SpanVariable = Extract<QuestionVariable, { type: "span" }>;

/**
 * Answer field for `span` unit_variables (design plan §11a/§11b). The
 * actual span-drawing interaction happens in `UnitFields`' rendered
 * `::field[column]` text (via `SpanAnnotationContext`, shared between the two
 * components by `JobRunner`) -- this component shows the spans
 * collected so far, provides mode toggles (Word vs Char), and lets the coder
 * remove/confirm them.
 */
export function SpanAnswerField({ onAnswer }: AnswerFieldProps<SpanVariable>) {
  const annotation = useSpanAnnotation();

  function colorFor(code: string): string | undefined {
    return annotation?.codes.find((c) => c.code === code)?.color;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Select text above to assign codes.
        </p>

        <div className="flex items-center gap-2.5">
          {/* Coder toggle for Word-level vs Character-level selection */}
          {annotation && (
            <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => annotation.setSelectionMode("word")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                  annotation.selectionMode === "word"
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Word selection: snap selections to whole words"
              >
                <span>Word</span>
              </button>
              <button
                type="button"
                onClick={() => annotation.setSelectionMode("character")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                  annotation.selectionMode === "character"
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Character selection: select exact characters"
              >
                <Type className="h-3 w-3" />
                <span>Char</span>
              </button>
            </div>
          )}

          <span className="text-xs font-mono font-medium text-muted-foreground">
            {annotation?.spans.length ?? 0} selected
          </span>
        </div>
      </div>

      <div className="max-h-28 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-2">
        {!annotation || annotation.spans.length === 0 ? (
          <p className="text-xs italic text-muted-foreground text-center py-1">No spans selected yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {annotation.spans.map((span) => {
              const badgeStyle = getCodeBadgeStyle(colorFor(span.code));
              return (
                <span
                  key={span.id}
                  className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs"
                  style={badgeStyle}
                >
                  <strong className="font-semibold">{span.code}:</strong>
                  <span className="max-w-[140px] truncate italic">&ldquo;{span.text}&rdquo;</span>
                  <button
                    type="button"
                    className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-black/10 transition-opacity cursor-pointer"
                    title="Remove span"
                    onClick={() => annotation.removeSpan(span.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => onAnswer({ done: true, skip: true })}>
          Skip
        </Button>
        <Button size="sm" onClick={() => onAnswer({ done: true, skip: false, spans: annotation?.spans ?? [] })}>
          Done
        </Button>
      </div>
    </div>
  );
}
