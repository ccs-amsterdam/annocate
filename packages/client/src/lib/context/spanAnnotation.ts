import { createContext, useContext } from "react";
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
 * `StudyRunner` mounts one `SpanAnnotationProvider` wrapping both `UnitFields`
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

export const SpanAnnotationContext = createContext<SpanAnnotationState | null>(null);

export function useSpanAnnotation(): SpanAnnotationState | null {
  return useContext(SpanAnnotationContext);
}
