import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import type { NominalOption, SpanAnswer, SpanSlice } from "@annotinder/contracts";

export interface PendingSpan {
  /** The unit field the slices are in (a span question can select in several). */
  field?: string;
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
 * fields (docs/client.md §4: annotation should be integrated with the
 * question flow, not a separate "annotation mode").
 *
 * `JobRunner` mounts one `SpanAnnotationProvider` wrapping both `UnitFields`
 * and the answer form whenever the current step is a `span` question.
 */
export interface SpanAnnotationState {
  /** The unit fields the current span question selects in. */
  fields: string[];
  /** The span question's options (value, label, color). */
  options: NominalOption[];
  spans: SpanAnswer[];
  selectionMode: "word" | "character";
  setSelectionMode: (mode: "word" | "character") => void;
  allowGaps: boolean;
  pendingSpan: PendingSpan | null;
  setPendingSpan: (pending: PendingSpan | null) => void;
  /** Adds a span in the pending selection's field. */
  addSpan: (slices: SpanSlice[], value: string) => void;
  updateSpan: (id: string, newValue: string) => void;
  removeSpan: (id: string) => void;
  /** True if any candidate slice overlaps an already-collected span (in the pending selection's field). */
  overlapsExisting: (slices: SpanSlice[]) => boolean;
  /** True if an identical span (same value and exact same slices) exists. */
  hasExactSpan: (slices: SpanSlice[], value: string) => boolean;
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
  fields,
  options,
  defaultSelectionMode = "word",
  allowGaps = false,
  initialSpans,
  initialPendingSpan,
  initialIsViewingAllLabels,
  variableName,
  children,
}: {
  fields: string[];
  options: NominalOption[];
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

  // Another question or other initial values: start over. Adjusted while
  // rendering rather than in an effect, so there is no render with stale state.
  const inputs = { variableName, initialSpans, initialPendingSpan, initialIsViewingAllLabels, defaultSelectionMode };
  const [previousInputs, setPreviousInputs] = useState(inputs);
  if ((Object.keys(inputs) as (keyof typeof inputs)[]).some((k) => inputs[k] !== previousInputs[k])) {
    setPreviousInputs(inputs);
    setSpans(initialSpans ?? []);
    setPendingSpanState(initialPendingSpan ?? null);
    setIsViewingAllLabels(initialIsViewingAllLabels ?? false);
    setFocusedSpanId(null);
    setSelectionMode(defaultSelectionMode);
  }

  const setPendingSpan = (pending: PendingSpan | null) => {
    setPendingSpanState(pending);
    if (pending) {
      setIsViewingAllLabels(false);
      setFocusedSpanId(null);
    }
  };

  // Compared by content: callers pass a new array each render.
  const fieldsKey = fields.join("\u0000");
  // Spans in the field of the pending selection (overlap and duplicates are per field).
  const pendingField = pendingSpan?.field ?? fields[0];
  const inPendingField = (list: SpanAnswer[]) => list.filter((s) => s.field === pendingField);

  const value = useMemo<SpanAnnotationState>(
    () => ({
      fields,
      options,
      spans,
      selectionMode,
      setSelectionMode,
      allowGaps,
      pendingSpan,
      setPendingSpan,
      addSpan: (slices, spanValue) =>
        setSpans((prev) => {
          // Ignore exact duplicate of same value on same slices
          const isDuplicate = prev.some(
            (s) =>
              s.value === spanValue &&
              s.slices.length === slices.length &&
              s.slices.every((sl, idx) => sl.offset === slices[idx].offset && sl.length === slices[idx].length),
          );
          if (isDuplicate) return prev;
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              field: pendingSpan?.field ?? fields[0] ?? "",
              value: spanValue,
              slices,
            },
          ];
        }),
      updateSpan: (id, newValue) =>
        setSpans((prev) => prev.map((s) => (s.id === id ? { ...s, value: newValue } : s))),
      removeSpan: (id) => setSpans((prev) => prev.filter((s) => s.id !== id)),
      overlapsExisting: (slices) =>
        inPendingField(spans).some((s) =>
          s.slices.some((sSlice) =>
            slices.some(
              (cand) => cand.offset < sSlice.offset + sSlice.length && sSlice.offset < cand.offset + cand.length,
            ),
          ),
        ),
      hasExactSpan: (slices, spanValue) =>
        inPendingField(spans).some(
          (s) =>
            s.value === spanValue &&
            s.slices.length === slices.length &&
            s.slices.every((sl, idx) => sl.offset === slices[idx].offset && sl.length === slices[idx].length),
        ),
      isViewingAllLabels,
      setIsViewingAllLabels,
      focusedSpanId,
      setFocusedSpanId,
    }),
    [fieldsKey, options, spans, selectionMode, allowGaps, pendingSpan, isViewingAllLabels, focusedSpanId],
  );

  return <SpanAnnotationContext.Provider value={value}>{children}</SpanAnnotationContext.Provider>;
}
