import { createContext, useContext } from "react";
import type { NominalOption, SpanAnswer, SpanSlice } from "@annotinder/contracts";

export interface PendingSpan {
  /** The unit field the slices are in (a span question can select in several). */
  field?: string;
  slices: SpanSlice[];
  anchorOffset?: number;
  /** A clicked span: the ids of all the spans on that word. */
  existingSpanIds?: string[];
  /** A span to open for editing at once. */
  targetSpanId?: string;
  isEditingExisting?: boolean;
  /** `create`: a new selection waiting for its label; `manage`: the menu of the spans on a clicked word. */
  mode?: "create" | "manage";
}

/**
 * The current unit's spans, shared by the text the coder selects in (the
 * unit's layout, `SelectableText`) and the span question's answer field
 * (`SpanAnswerField`): annotating is part of answering the question, not a
 * separate mode (docs/client.md §4 "Span and relation answers").
 * `StudyRunner` puts one `SpanAnnotationProvider` around the unit and the
 * answer pane; outside a span question it has no fields.
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
  /** The list of all the unit's spans is open instead of the answer form. */
  isViewingAllLabels: boolean;
  setIsViewingAllLabels: (viewing: boolean) => void;
  /** A span being edited (e.g. opened from the list): highlighted and scrolled to in the text. */
  focusedSpanId: string | null;
  setFocusedSpanId: (id: string | null) => void;
}

export const SpanAnnotationContext = createContext<SpanAnnotationState | null>(null);

export function useSpanAnnotation(): SpanAnnotationState | null {
  return useContext(SpanAnnotationContext);
}
