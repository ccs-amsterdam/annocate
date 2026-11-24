// Moving keyboard focus between a question's answer targets (docs/client.md
// §4 "Keyboard"): every element marked `data-key-target` (option buttons,
// scale points), by where it is on screen, so it works for any layout: rows,
// grids, wrapping buttons, a scale's table.

export type Direction = "left" | "right" | "up" | "down";

const ARROWS: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** The direction of an arrow key, if it is one. */
export const arrowDirection = (key: string): Direction | undefined => ARROWS[key];

/** The answer targets on screen, enabled and visible. */
function targets(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-key-target]")].filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
  );
}

/** Whether focus is in an element that keeps arrow keys for itself (e.g. selecting text for a span). */
export function focusKeepsArrows(): boolean {
  return !!document.activeElement?.closest("[data-keys-own]");
}

/** Focuses the chosen target (pressed or checked), else the first; false without targets. */
export function focusChosen(): boolean {
  const all = targets();
  const chosen = all.find(
    (el) =>
      el.getAttribute("aria-pressed") === "true" ||
      el.getAttribute("aria-checked") === "true" ||
      (el as HTMLInputElement).checked,
  );
  const el = chosen ?? all[0];
  if (!el) return false;
  el.focus();
  return true;
}

/**
 * The nearest target in a direction from a rectangle: ahead of it, scored by
 * the distance along the direction plus twice the distance across it (so the
 * next one in the same row or column wins over a closer one beside it).
 */
export function nearest(from: DOMRect, candidates: { rect: DOMRect }[], direction: Direction): number {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach(({ rect }, i) => {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const along = direction === "left" ? cx - x : direction === "right" ? x - cx : direction === "up" ? cy - y : y - cy;
    const across = direction === "left" || direction === "right" ? Math.abs(y - cy) : Math.abs(x - cx);
    if (along <= 1) return;
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Whether a part of the screen that scrolls with the keys (`data-key-scroll`: the unit) has more to show up or down. */
function canScroll(direction: Direction): boolean {
  if (direction !== "up" && direction !== "down") return false;
  return [...document.querySelectorAll<HTMLElement>("[data-key-scroll]")].some((el) =>
    direction === "up" ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1,
  );
}

/**
 * Moves focus to the nearest target in a direction (from the focused one,
 * else the chosen or first). False when the key is not used: without
 * targets, and for ↑ / ↓ with focus outside the targets while the unit can
 * still scroll that way (the browser scrolls it; at its end the key moves to
 * the answers).
 */
export function moveFocus(direction: Direction): boolean {
  const all = targets();
  const current = all.find((el) => el === document.activeElement);
  if (!current) return canScroll(direction) ? false : focusChosen();
  const others = all.filter((el) => el !== current).map((el) => ({ el, rect: el.getBoundingClientRect() }));
  const i = nearest(current.getBoundingClientRect(), others, direction);
  if (i >= 0) others[i].el.focus();
  return true;
}
