// The text of a field in the DOM: it is split over several text nodes (the
// `<mark>`s of spans), and positions in it are character offsets in the
// whole text.

/** A selection's position (a node and an offset in it, from `Range`) as a character offset in `root`'s whole text. */
export function getAbsoluteOffset(root: Node, target: Node, offsetInTarget: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === target) return total + offsetInTarget;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return total;
}

/** A Range over `root`'s text from character `start` to `end`. */
function rangeOf(root: Node, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let total = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && start < total + length) {
      range.setStart(node, start - total);
      started = true;
    }
    if (started && end <= total + length) {
      range.setEnd(node, end - total);
      return range;
    }
    total += length;
  }
  return null;
}

/**
 * The word on the line above or below word `from` (the one nearest it
 * across), by where the words are on screen; `from` itself at the first or
 * last line.
 */
export function wordOnNextLine(root: Node, words: readonly [number, number][], from: number, down: boolean): number {
  const rect = (i: number) => rangeOf(root, words[i][0], words[i][1])?.getBoundingClientRect();
  const current = rect(from);
  if (!current) return from;
  const middleY = current.top + current.height / 2;
  const middleX = current.left + current.width / 2;
  let best = from;
  let lineDistance = Infinity;
  let bestDx = Infinity;
  for (let i = down ? from + 1 : from - 1; down ? i < words.length : i >= 0; i += down ? 1 : -1) {
    const r = rect(i);
    if (!r) continue;
    const dy = down ? r.top + r.height / 2 - middleY : middleY - (r.top + r.height / 2);
    if (dy < current.height / 2) continue; // Still on this line
    if (lineDistance === Infinity) lineDistance = dy;
    else if (dy - lineDistance > current.height / 2) break; // Past the next line
    const dx = Math.abs(r.left + r.width / 2 - middleX);
    if (dx < bestDx) {
      best = i;
      bestDx = dx;
    }
  }
  return best;
}

/** What the coder selected in `root`'s text with the mouse, as character offsets. */
export interface MouseSelection {
  start: number;
  end: number;
  /** Nothing was dragged over: a click at `start`. */
  isClick: boolean;
}

/** The browser's selection when it is in `root`'s text (null otherwise); the selection is then cleared. */
export function takeSelection(root: Node): MouseSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const a = getAbsoluteOffset(root, range.startContainer, range.startOffset);
  const b = getAbsoluteOffset(root, range.endContainer, range.endOffset);
  const isClick = selection.isCollapsed || a === b;
  selection.removeAllRanges();
  return { start: Math.min(a, b), end: Math.max(a, b), isClick };
}

/**
 * Focuses a new selection's first label button (SpanAnswerField's, or the
 * menu at the selection), and keeps it there for a few frames: the menu at
 * a selection that just began is still being replaced (it measures its
 * room, then mounts in a portal), which drops focus to the page. Stops when
 * focus went anywhere else, or the labels are gone.
 */
export function focusLabels(frames = 20, seen = false): void {
  const active = document.activeElement;
  const onPage = !active || active === document.body;
  if (!onPage && !active?.hasAttribute("data-span-label")) return;
  const first = [...document.querySelectorAll<HTMLElement>("[data-span-label]")].find(
    (el) => el.getClientRects().length > 0,
  );
  // Labelled (or cancelled) since: done
  if (!first && seen) return;
  if (onPage && first) first.focus();
  if (frames > 0) requestAnimationFrame(() => focusLabels(frames - 1, seen || !!first));
}
