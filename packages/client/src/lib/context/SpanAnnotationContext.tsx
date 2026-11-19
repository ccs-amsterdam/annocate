import { useCallback, useState, useMemo, type ReactNode } from "react";
import type { NominalOption, SpanAnswer } from "@annotinder/contracts";
import { SpanAnnotationContext, type PendingSpan, type SpanAnnotationState } from "./spanAnnotation";

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

  const setPendingSpan = useCallback((pending: PendingSpan | null) => {
    setPendingSpanState(pending);
    if (pending) {
      setIsViewingAllLabels(false);
      setFocusedSpanId(null);
    }
  }, []);

  // Compared by content: callers pass a new array each render.
  const fieldsKey = fields.join("\u0000");
  const sameFields = useMemo(() => (fieldsKey === "" ? [] : fieldsKey.split("\u0000")), [fieldsKey]);

  const value = useMemo<SpanAnnotationState>(() => {
    const fields = sameFields;
    // Spans in the field of the pending selection (overlap and duplicates are per field).
    const pendingField = pendingSpan?.field ?? fields[0];
    const inPendingField = (list: SpanAnswer[]) => list.filter((s) => s.field === pendingField);
    return {
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
      updateSpan: (id, newValue) => setSpans((prev) => prev.map((s) => (s.id === id ? { ...s, value: newValue } : s))),
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
    };
  }, [
    sameFields,
    options,
    spans,
    selectionMode,
    allowGaps,
    pendingSpan,
    setPendingSpan,
    isViewingAllLabels,
    focusedSpanId,
  ]);

  return <SpanAnnotationContext.Provider value={value}>{children}</SpanAnnotationContext.Provider>;
}
