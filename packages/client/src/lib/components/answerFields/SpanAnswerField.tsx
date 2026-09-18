import type { AnswerFieldProps, QuestionVariable } from "./types";
import { Button } from "@/components/ui/button";
import { useSpanAnnotation } from "../../context/SpanAnnotationContext";

type SpanVariable = Extract<QuestionVariable, { type: "span" }>;

/**
 * Answer field for `span` unit_variables (design plan §11a/§11b). The
 * actual span-drawing interaction happens in `UnitFields`' rendered
 * `::field[column]` text (via `SpanAnnotationContext`, shared between the two
 * components by `JobRunner`) -- this component only shows the spans
 * collected so far and lets the coder remove/confirm them.
 */
export function SpanAnswerField({ onAnswer }: AnswerFieldProps<SpanVariable>) {
  const annotation = useSpanAnnotation();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Select spans of text above and assign a code. Selected spans:
      </p>
      <ul className="flex flex-col gap-1">
        {(!annotation || annotation.spans.length === 0) && (
          <li className="text-sm italic text-muted-foreground">None yet</li>
        )}
        {annotation?.spans.map((span) => (
          <li key={span.id} className="flex items-center gap-2 text-sm">
            <span className="rounded bg-muted px-2 py-0.5">{span.code}</span>
            <button
              type="button"
              className="text-muted-foreground underline hover:text-destructive"
              onClick={() => annotation.removeSpan(span.id)}
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => onAnswer({ done: true, skip: true })}>
          Skip
        </Button>
        <Button onClick={() => onAnswer({ done: true, skip: false, spans: annotation?.spans ?? [] })}>Done</Button>
      </div>
    </div>
  );
}
