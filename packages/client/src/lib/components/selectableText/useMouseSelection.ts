import { useCallback, useEffect, type RefObject } from "react";
import type { PendingSpan } from "../../context/spanAnnotation";
import { getWordAtPosition, snapToWord, toggleSliceRange } from "../spanText";
import { takeSelection } from "./domRanges";
import { openSpanMenu, selectionOf, spansAt, type FieldSpans } from "./fieldSpans";

/**
 * Selecting in a field's text with the mouse (or by touch): a click or a
 * drag that ends anywhere on the page. Returns the function that reads the
 * browser's selection in the text and acts on it (also for a selection made
 * with Shift + arrows).
 */
export function useMouseSelection(
  field: FieldSpans | null,
  text: string,
  container: RefObject<HTMLElement | null>,
): () => void {
  const processSelection = useCallback(() => {
    if (!field || !container.current) return;
    const selected = takeSelection(container.current);
    if (!selected) return;
    if (selected.isClick) clickAt(field, text, selected.start);
    else dragOver(field, text, selected.start, selected.end);
  }, [field, text, container]);

  // On the document, not the text: a drag over an inline field (a headline
  // over two lines) can end between its line boxes. processSelection only
  // acts on a selection inside this text.
  const active = field !== null;
  useEffect(() => {
    if (!active) return;
    document.addEventListener("mouseup", processSelection);
    return () => document.removeEventListener("mouseup", processSelection);
  }, [active, processSelection]);

  return processSelection;
}

/** A dragged range: a new selection, or a change of the one waiting for its label. */
function dragOver(field: FieldSpans, text: string, from: number, to: number): void {
  const [start, end] = field.selectionMode === "word" ? snapToWord(text, from, to) : [from, to];
  if (end <= start) return;
  const pending = field.pendingSpan;
  if (pending?.mode === "create") changeSelection(field, text, pending, { start, end, isClick: false });
  else field.setPendingSpan(selectionOf(text, start, end));
}

/** A click. In character mode no snapping: a click only opens an existing span (spans are made by selecting). */
function clickAt(field: FieldSpans, text: string, offset: number): void {
  const word = field.selectionMode === "word" ? getWordAtPosition(text, offset) : null;
  const pending = field.pendingSpan;
  if (pending?.mode === "create") {
    if (word) changeSelection(field, text, pending, { start: word[0], end: word[1], isClick: true });
    return;
  }
  // On a labelled span: the menu of the spans there, always first
  const covering = spansAt(field.spans, offset);
  if (covering.length > 0) {
    openSpanMenu(field, covering);
    return;
  }
  // On a word: a new selection of that word; elsewhere: close what was open
  field.setPendingSpan(word ? selectionOf(text, word[0], word[1]) : null);
}

/**
 * While a new selection waits for its label, more text changes it: with
 * gaps allowed each word or range toggles; without, the selection runs
 * from its first word (`anchorOffset`) to the end of what was clicked or
 * dragged (a click before that first word is ignored).
 */
function changeSelection(
  field: FieldSpans,
  text: string,
  pending: PendingSpan,
  { start, end, isClick }: { start: number; end: number; isClick: boolean },
): void {
  if (field.allowGaps) {
    const slices = toggleSliceRange(text, pending.slices, { offset: start, length: end - start });
    field.setPendingSpan(slices.length === 0 ? null : { ...pending, slices });
    return;
  }
  const anchor = pending.anchorOffset ?? pending.slices[0]?.offset ?? start;
  if (isClick && end <= anchor) return;
  const newEnd = Math.max(anchor, end);
  field.setPendingSpan({
    ...pending,
    anchorOffset: anchor,
    slices: [{ offset: anchor, length: newEnd - anchor, text: text.slice(anchor, newEnd) }],
  });
}
