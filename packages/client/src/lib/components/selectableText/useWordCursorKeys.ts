import { useEffect, useMemo, useState, type RefObject } from "react";
import type { PendingSpan } from "../../context/spanAnnotation";
import { PRIORITY, type KeyPress } from "../../keyboard/controller";
import { arrowDirection, type Direction } from "../../keyboard/focus";
import { useKeyScope } from "../../keyboard/hooks";
import { wordRanges, wordsSlice } from "../spanText";
import { focusLabels, wordOnNextLine } from "./domRanges";
import { openSpanMenu, spansAt, type FieldSpans } from "./fieldSpans";

type Words = readonly [number, number][];

/** What the keys work on: the field's text, where the cursor is in it, and the selection being made. */
interface WordCursor {
  field: FieldSpans;
  text: string;
  words: Words;
  /** The word the cursor is on (null: none yet). */
  cursor: number | null;
  /** While selecting: the word the selection started at. */
  anchor: number | null;
  setAnchor: (word: number | null) => void;
  container: HTMLElement | null;
}

/**
 * The keyboard in a field's text (in the field clicked last, else the
 * first): the arrows move a cursor over the words (up and down: a line; at
 * the text's edge on into the question's next or previous field), Space
 * starts a selection there, the arrows extend it, and Space again ends it
 * (on to its label). Enter on a labelled word opens its spans; Esc removes
 * the cursor. Returns the range of the word the cursor is on.
 */
export function useWordCursorKeys(
  field: FieldSpans | null,
  text: string,
  container: RefObject<HTMLElement | null>,
): readonly [number, number] | null {
  const words = useMemo(() => wordRanges(text), [text]);
  // The field the keyboard works in: the context's cursor (clicked last), else the first
  const hasKeyboard = field !== null && field.field === (field.cursor?.field ?? field.fields[0]);
  const cursor = hasKeyboard ? cursorWord(field.cursor?.word ?? null, words.length) : null;
  const pending = field?.pendingSpan ?? null;
  const [anchor, setAnchor] = useState<number | null>(null);
  // A selection that was cancelled or labelled ends the keyboard's selecting
  if (anchor !== null && !pending) setAnchor(null);

  useKeyScope(
    (press) => {
      if (!field || press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) return false;
      // Space or Enter on a focused button is the button's
      if (press.onControl) return false;
      // A selection waiting for its label: the keys are the labels' (the base keys move between them)
      if (pending && anchor === null) return false;
      return handleKey(press, { field, text, words, cursor, anchor, setAnchor, container: container.current });
    },
    hasKeyboard,
    { priority: PRIORITY.field },
  );

  // The keyboard's word stays in view
  useEffect(() => {
    container.current?.querySelector("[data-cursor]")?.scrollIntoView({ block: "nearest" });
  }, [cursor, container]);

  return cursor !== null && words[cursor] ? words[cursor] : null;
}

/** The word the cursor is on, of `count` words (`word` -1: the last; past the end: the last). */
function cursorWord(word: number | null, count: number): number | null {
  if (word === null || count === 0) return null;
  return word < 0 ? count - 1 : Math.min(word, count - 1);
}

function handleKey(press: KeyPress, state: WordCursor): boolean {
  const direction = arrowDirection(press.key);
  if (direction) return moveCursor(state, direction);
  if (state.cursor === null) return false;
  if (press.key === " ") return toggleSelecting(state, state.cursor);
  if (press.key === "Enter" && state.anchor === null) return openSpansAt(state, state.cursor);
  if (press.key === "Escape" && !state.field.pendingSpan) {
    state.field.setCursor(null);
    return true;
  }
  return false;
}

/** An arrow: the cursor to the next word that way (and the selection with it), or on into the next field. */
function moveCursor(state: WordCursor, direction: Direction): boolean {
  const { field, text, words, anchor } = state;
  if (anchor === null && moveToNextField(state, direction)) return true;
  if (words.length === 0) return false;
  const next = nextWord(state, direction);
  field.setCursor({ field: field.field, word: next });
  if (anchor !== null) field.setPendingSpan(wordsSelection(text, words, anchor, next));
  return true;
}

/** At the first or last word (up and down: line), or in an empty text: on into the question's previous or next field. */
function moveToNextField(state: WordCursor, direction: Direction): boolean {
  const { field } = state;
  const forward = direction === "right" || direction === "down";
  const neighbour = field.fields[field.fields.indexOf(field.field) + (forward ? 1 : -1)];
  if (neighbour === undefined || !atEdge(state, direction)) return false;
  field.setCursor({ field: neighbour, word: forward ? 0 : -1 });
  return true;
}

/** The cursor can't go further that way in this text. */
function atEdge({ words, cursor, container }: WordCursor, direction: Direction): boolean {
  if (words.length === 0) return true;
  if (cursor === null) return false;
  const forward = direction === "right" || direction === "down";
  if (direction === "left" || direction === "right") return cursor === (forward ? words.length - 1 : 0);
  return !!container && wordOnNextLine(container, words, cursor, forward) === cursor;
}

/** The word an arrow moves the cursor to (the first word when there is no cursor yet). */
function nextWord({ words, cursor, container }: WordCursor, direction: Direction): number {
  if (cursor === null) return 0;
  if (direction === "left") return Math.max(0, cursor - 1);
  if (direction === "right") return Math.min(words.length - 1, cursor + 1);
  return container ? wordOnNextLine(container, words, cursor, direction === "down") : cursor;
}

/** Space: starts a selection at the cursor's word, or ends the one being made. */
function toggleSelecting({ field, text, words, anchor, setAnchor }: WordCursor, cursor: number): boolean {
  if (anchor === null) {
    setAnchor(cursor);
    field.setPendingSpan(wordsSelection(text, words, cursor, cursor));
  } else {
    // The selection is done: on to its label, once Space is up (released on a focused label, it would click it)
    setAnchor(null);
    window.addEventListener("keyup", () => requestAnimationFrame(() => focusLabels()), { once: true });
  }
  return true;
}

/** Enter on a labelled word: the menu of its spans. */
function openSpansAt({ field, words }: WordCursor, cursor: number): boolean {
  const covering = spansAt(field.spans, words[cursor][0]);
  if (covering.length === 0) return false;
  openSpanMenu(field, covering);
  return true;
}

/** A new selection waiting for its label: the text from word `a` to word `b` (either order). */
function wordsSelection(text: string, words: Words, a: number, b: number): PendingSpan {
  const slice = wordsSlice(text, words, a, b);
  return { slices: [slice], anchorOffset: slice.offset, mode: "create" };
}
