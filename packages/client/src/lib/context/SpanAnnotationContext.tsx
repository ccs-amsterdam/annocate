import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from "react";
import type { CodebookCode, SpanAnswer, SpanSlice } from "@annotinder/contracts";

export interface PendingSpan {
  slices: SpanSlice[];
  anchorOffset?: number;
  /** When clicking an existing span, contains all overlapping span IDs on that token/word */
  existingSpanIds?: string[];
  /** When editing/deleting an existing span, points to its specific ID */
  targetSpanId?: string;
  isEditingExisting?: boolean;
  /** UI mode: "create" (assign code to new selection) or "manage" (menu of existing labels on this word) */
  mode?: "create" | "manage";
}

/**
 * Ambient state for the current unit's span annotations. Bridges the answer
 * form (which receives the coder's code choice and renders via
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
  allowGaps: boolean;
  pendingSpan: PendingSpan | null;
  setPendingSpan: (pending: PendingSpan | null) => void;
  addSpan: (slices: SpanSlice[], code: string) => void;
  updateSpan: (id: string, newCode: string) => void;
  removeSpan: (id: string) => void;
  /** True if any candidate slice overlaps any already-collected span. */
  overlapsExisting: (slices: SpanSlice[]) => boolean;
  /** True if an identical span (same code and exact same slices) exists. */
  hasExactSpan: (slices: SpanSlice[], code: string) => boolean;
  /** True when the list of all labeled spans is open in place of the answer form */
  isViewingAllLabels: boolean;
  setIsViewingAllLabels: (viewing: boolean) => void;
  /** The ID of a span focused for inspection/editing (e.g. from the all labels list) */
  focusedSpanId: string | null;
  setFocusedSpanId: (id: string | null) => void;
}

const SpanAnnotationContext = createContext<SpanAnnotationState | null>(null);

export function useSpanAnnotation(): SpanAnnotationState | null {
  return useContext(SpanAnnotationContext);
}

export function SpanAnnotationProvider({
  column,
  codes,
  defaultSelectionMode = "word",
  allowGaps = false,
  initialSpans,
  initialPendingSpan,
  initialIsViewingAllLabels,
  variableName,
  children,
}: {
  column: string;
  codes: CodebookCode[];
  defaultSelectionMode?: "word" | "character";
  allowGaps?: boolean;
  /** Seeds already-collected spans, e.g. when resuming a unit that already
   * has an answer stored for this variable. */
  initialSpans?: SpanAnswer[];
  initialPendingSpan?: PendingSpan;
  initialIsViewingAllLabels?: boolean;
  /** When variableName changes within the same unit, synchronize internal span state */
  variableName?: string;
  children: ReactNode;
}) {
  const [spans, setSpans] = useState<SpanAnswer[]>(initialSpans ?? []);
  const [selectionMode, setSelectionMode] = useState<"word" | "character">(defaultSelectionMode);
  const [pendingSpan, setPendingSpanState] = useState<PendingSpan | null>(initialPendingSpan ?? null);
  const [isViewingAllLabels, setIsViewingAllLabels] = useState(initialIsViewingAllLabels ?? false);
  const [focusedSpanId, setFocusedSpanId] = useState<string | null>(null);

  useEffect(() => {
    setSpans(initialSpans ?? []);
    setPendingSpanState(initialPendingSpan ?? null);
    setIsViewingAllLabels(initialIsViewingAllLabels ?? false);
    setFocusedSpanId(null);
    setSelectionMode(defaultSelectionMode);
  }, [variableName, initialSpans, initialPendingSpan, initialIsViewingAllLabels, defaultSelectionMode]);

  const setPendingSpan = (pending: PendingSpan | null) => {
    setPendingSpanState(pending);
    if (pending) {
      setIsViewingAllLabels(false);
      setFocusedSpanId(null);
    }
  };

  const value = useMemo<SpanAnnotationState>(
    () => ({
      column,
      codes,
      spans,
      selectionMode,
      setSelectionMode,
      allowGaps,
      pendingSpan,
      setPendingSpan,
      addSpan: (slices, code) =>
        setSpans((prev) => {
          // Ignore exact duplicate of same code on same slices
          const isDuplicate = prev.some(
            (s) =>
              s.code === code &&
              s.slices.length === slices.length &&
              s.slices.every((sl, idx) => sl.offset === slices[idx].offset && sl.length === slices[idx].length),
          );
          if (isDuplicate) return prev;
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              field: column,
              code,
              slices,
            },
          ];
        }),
      updateSpan: (id, newCode) =>
        setSpans((prev) => prev.map((s) => (s.id === id ? { ...s, code: newCode } : s))),
      removeSpan: (id) => setSpans((prev) => prev.filter((s) => s.id !== id)),
      overlapsExisting: (slices) =>
        spans.some((s) =>
          s.slices.some((sSlice) =>
            slices.some(
              (cand) => cand.offset < sSlice.offset + sSlice.length && sSlice.offset < cand.offset + cand.length,
            ),
          ),
        ),
      hasExactSpan: (slices, code) =>
        spans.some(
          (s) =>
            s.code === code &&
            s.slices.length === slices.length &&
            s.slices.every((sl, idx) => sl.offset === slices[idx].offset && sl.length === slices[idx].length),
        ),
      isViewingAllLabels,
      setIsViewingAllLabels,
      focusedSpanId,
      setFocusedSpanId,
    }),
    [column, codes, spans, selectionMode, allowGaps, pendingSpan, isViewingAllLabels, focusedSpanId],
  );

  return <SpanAnnotationContext.Provider value={value}>{children}</SpanAnnotationContext.Provider>;
}
