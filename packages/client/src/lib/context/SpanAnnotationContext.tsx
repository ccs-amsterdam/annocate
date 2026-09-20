import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CodebookCode, SpanAnswer } from "@annotinder/contracts";

export interface PendingSpan {
  offset: number;
  length: number;
  text: string;
  /**
   * "create": User selected text to assign a new label.
   * "manage": User clicked an existing label (or annotation item) to view & delete labels.
   */
  mode?: "create" | "manage";
  existingSpanIds?: string[];
  isEditingExisting?: boolean;
  targetSpanId?: string;
}

/**
 * Bridges the currently-answered `span` variable (rendered inside
 * `Question`/`SpanAnswerField`) and the interactive text selection that has
 * to happen inside `UnitFields`' rendered layout, for the SAME unit-data
 * column (design plan §11b: annotation should be integrated with the
 * question flow, not a separate "annotation mode").
 *
 * `JobRunner` mounts one `SpanAnnotationProvider` wrapping both `UnitFields`
 * and the answer form whenever the current step is a `span` unit_variable.
 */
export interface SpanAnnotationState {
  /** The unit data column the current span variable targets. */
  column: string;
  codes: CodebookCode[];
  spans: SpanAnswer[];
  selectionMode: "word" | "character";
  setSelectionMode: (mode: "word" | "character") => void;
  pendingSpan: PendingSpan | null;
  setPendingSpan: (pending: PendingSpan | null) => void;
  /** `text` is the exact substring of the column's raw value at
   * `[offset, offset + length)`, included in the stored `SpanAnswer` so
   * downstream analysis doesn't need to re-slice the unit data. */
  addSpan: (offset: number, length: number, code: string, text: string) => void;
  removeSpan: (id: string) => void;
  /** True if `[offset, offset+length)` overlaps any already-collected span. */
  overlapsExisting: (offset: number, length: number) => boolean;
  /** True if an identical span (same code and same span offset/length) exists. */
  hasExactSpan: (offset: number, length: number, code: string) => boolean;
}

const SpanAnnotationContext = createContext<SpanAnnotationState | null>(null);

export function useSpanAnnotation(): SpanAnnotationState | null {
  return useContext(SpanAnnotationContext);
}

export function SpanAnnotationProvider({
  column,
  codes,
  defaultSelectionMode = "word",
  initialSpans,
  initialPendingSpan,
  children,
}: {
  column: string;
  codes: CodebookCode[];
  defaultSelectionMode?: "word" | "character";
  /** Seeds already-collected spans, e.g. when resuming a unit that already
   * has an answer stored for this variable. */
  initialSpans?: SpanAnswer[];
  initialPendingSpan?: PendingSpan;
  children: ReactNode;
}) {
  const [spans, setSpans] = useState<SpanAnswer[]>(initialSpans ?? []);
  const [selectionMode, setSelectionMode] = useState<"word" | "character">(defaultSelectionMode);
  const [pendingSpan, setPendingSpan] = useState<PendingSpan | null>(initialPendingSpan ?? null);

  const value = useMemo<SpanAnnotationState>(
    () => ({
      column,
      codes,
      spans,
      selectionMode,
      setSelectionMode,
      pendingSpan,
      setPendingSpan,
      addSpan: (offset, length, code, text) =>
        setSpans((prev) => {
          // Ignore exact duplicate of same code on same range
          if (prev.some((s) => s.offset === offset && s.length === length && s.code === code)) {
            return prev;
          }
          return [
            ...prev,
            { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, field: column, offset, length, code, text },
          ];
        }),
      removeSpan: (id) => setSpans((prev) => prev.filter((s) => s.id !== id)),
      overlapsExisting: (offset, length) =>
        spans.some((s) => offset < s.offset + s.length && s.offset < offset + length),
      hasExactSpan: (offset, length, code) =>
        spans.some((s) => s.offset === offset && s.length === length && s.code === code),
    }),
    [column, codes, spans, selectionMode, pendingSpan],
  );

  return <SpanAnnotationContext.Provider value={value}>{children}</SpanAnnotationContext.Provider>;
}
