import { useLayoutEffect, useRef, type RefObject } from "react";

const DURATION = 220;
const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/** An element's top, without the vertical shift of an animation running on it. */
function layoutTop(el: HTMLElement): number {
  const top = el.getBoundingClientRect().top;
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === "none") return top;
  return top - new DOMMatrixReadOnly(transform).m42;
}

/**
 * Animates elements to their new place when a render moves them ("FLIP"):
 * every element in `container` with a `data-flip-key` is measured after
 * each render; one whose place changed starts from where it was on screen
 * and glides to the new place. Places are relative to the nearest flip
 * ancestor (or the container), so the children of a moved block move with
 * it, not on their own; scrolling moves nothing. Other renders leave a
 * glide alone. Off with reduced motion.
 */
export function useFlip(container: RefObject<HTMLElement | null>): void {
  const places = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-flip-key]"));
    const tops = new Map(elements.map((el) => [el, layoutTop(el)]));
    const rootTop = root.getBoundingClientRect().top;
    const next = new Map<string, number>();
    for (const el of elements) {
      const parent = el.parentElement?.closest<HTMLElement>("[data-flip-key]");
      // On screen, the parent's own glide moves the child too: relative to where the parent is shown
      const base = parent && root.contains(parent) ? parent.getBoundingClientRect().top : rootTop;
      next.set(el.dataset.flipKey!, tops.get(el)! - base);
    }
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      for (const el of elements) {
        const before = places.current.get(el.dataset.flipKey!);
        const now = next.get(el.dataset.flipKey!)!;
        if (before === undefined || Math.abs(before - now) < 1) continue;
        // From where it is on screen now (mid-glide, if it was moving), to its place
        const shown = el.getBoundingClientRect().top - tops.get(el)!;
        el.getAnimations().forEach((a) => a.cancel());
        el.animate([{ transform: `translateY(${before - now + shown}px)` }, { transform: "none" }], { duration: DURATION, easing: EASING });
      }
    }
    places.current = next;
  });
}
