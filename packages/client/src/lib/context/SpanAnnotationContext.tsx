import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CodebookCode, SpanAnswer } from "@annotinder/contracts";

/**
 * Bridges the currently-answered `span` variable (rendered inside
 * `Question`/`SpanAnswerField`) and the interactive text selection that has
 * to happen inside `UnitFields`' rendered layout, for the SAME unit-data
 * column (design plan §11b: annotation should be integrated with the
 * question flow, not a separate "annotation mode").
 *
 * `JobRunner` mounts one `SpanAnnotationProvider` (keyed by the current
 * item's name, so state resets per question) whenever the current step is a
 * `span` unit_variable; `UnitFields`' `::field[column]` renderer consults it
 * to decide whether that column's text should render as selectable, and
 * `SpanAnswerField` consults it to show/edit the spans collected so far.
 */
export interface SpanAnnotationState {
  /** The unit data column the current span variable targets. */
  column: string;
  codes: CodebookCode[];
  spans: SpanAnswer[];
  /** `text` is the exact substring of the column's raw value at
   * `[offset, offset + length)`, included in the stored `SpanAnswer` so
   * downstream analysis doesn't need to re-slice the unit data (design plan
   * §11f). */
  addSpan: (offset: number, length: number, code: string, text: string) => void;
  removeSpan: (id: string) => void;
}

const SpanAnnotationContext = createContext<SpanAnnotationState | null>(null);

export function useSpanAnnotation(): SpanAnnotationState | null {
  return useContext(SpanAnnotationContext);
}

export function SpanAnnotationProvider({
  column,
  codes,
  children,
}: {
  column: string;
  codes: CodebookCode[];
  children: ReactNode;
}) {
  const [spans, setSpans] = useState<SpanAnswer[]>([]);

  const value = useMemo<SpanAnnotationState>(
    () => ({
      column,
      codes,
      spans,
      addSpan: (offset, length, code, text) =>
        setSpans((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, field: column, offset, length, code, text },
        ]),
      removeSpan: (id) => setSpans((prev) => prev.filter((s) => s.id !== id)),
    }),
    [column, codes, spans],
  );

  return <SpanAnnotationContext.Provider value={value}>{children}</SpanAnnotationContext.Provider>;
}
