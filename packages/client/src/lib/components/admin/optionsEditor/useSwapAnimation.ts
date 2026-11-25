import { useLayoutEffect, useRef } from "react";

/**
 * A moved option and the one it swapped places with slide past each other.
 * `grid` goes on the element holding the rows, whose cells carry
 * `data-option-row`; call `swapped` when two rows change places, and they
 * slide once the options have changed.
 */
export function useSwapAnimation(options: unknown) {
  const grid = useRef<HTMLDivElement>(null);
  const swap = useRef<{ moved: number; other: number } | null>(null);
  useLayoutEffect(() => {
    const rows = swap.current;
    swap.current = null;
    if (rows && grid.current && !reducedMotion()) slidePast(grid.current, rows.moved, rows.other);
  }, [options]);
  const swapped = (moved: number, other: number) => {
    swap.current = { moved, other };
  };
  return { grid, swapped };
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Both rows slide from where the other one is to their own place. */
function slidePast(grid: HTMLElement, moved: number, other: number) {
  const cells = (row: number) => Array.from(grid.querySelectorAll<HTMLElement>(`[data-option-row="${row}"]`));
  const top = (row: number) => cells(row)[0]?.getBoundingClientRect().top ?? 0;
  const dy = top(other) - top(moved);
  const slide = (row: number, from: number) =>
    cells(row).forEach((el) =>
      el.animate([{ transform: `translateY(${from}px)` }, { transform: "none" }], {
        duration: 220,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }),
    );
  slide(moved, dy);
  slide(other, -dy);
}
