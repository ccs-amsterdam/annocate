import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { optionLabel, SWIPE_DIRECTIONS, type NominalOption } from "@annotinder/contracts";

// Swipe answering (docs/client.md §4): the card (the unit, or the question
// card outside a loop) is dragged left, right or up; the option for that
// direction shows on it while dragging. Released past a threshold (or flung)
// it flies off and the option is the answer; otherwise it springs back.
// Buttons and arrow keys fly it off the same way (`useSwipe`).

export type SwipeDirection = (typeof SWIPE_DIRECTIONS)[number];

/** How far the card must be dragged to answer: a share of its width (sideways), or pixels (up). */
const SIDEWAYS_SHARE = 0.3;
const UP_DISTANCE = 120;
/** A quick flick answers too: px/ms, with at least this many px of movement. */
const FLING_SPEED = 0.6;
const FLING_MIN = 40;
/** Movement before a press becomes a drag (so clicks and taps still work). */
const DEAD_ZONE = 8;
const FLY_MS = 220;

interface SwipeState {
  options: NominalOption[];
  /** Flies the card off in a direction (from where a drag let go), then answers with its option. */
  swipe: (direction: SwipeDirection, from?: { x: number; y: number }) => void;
  /** The card's element registers here, so `swipe` can animate it. */
  register: (card: HTMLDivElement | null, overlay: HTMLDivElement | null) => void;
}

const SwipeContext = createContext<SwipeState | null>(null);

/** The swipe of the current question, if it is a swipe question with a card. */
export function useSwipe(): SwipeState | null {
  return useContext(SwipeContext);
}

/** The option for a direction (1st left, 2nd right, 3rd up). */
export function optionFor(options: NominalOption[], direction: SwipeDirection): NominalOption | undefined {
  return options[SWIPE_DIRECTIONS.indexOf(direction)];
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** The card's transform for an offset: moved, and tilted when moved sideways. */
function transformFor(x: number, y: number): string {
  const tilt = Math.max(-15, Math.min(15, x / 20));
  return `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
}

/** Shows the option for a direction on the overlay, at an opacity (0: hidden). */
function showOverlay(overlay: HTMLDivElement | null, option: NominalOption | undefined, direction: SwipeDirection | null, strength: number) {
  if (!overlay) return;
  if (!option || !direction || strength <= 0) {
    overlay.style.opacity = "0";
    return;
  }
  overlay.style.opacity = String(Math.min(1, strength));
  overlay.dataset.direction = direction;
  const label = overlay.firstElementChild as HTMLElement | null;
  if (label) {
    label.textContent = optionLabel(option);
    label.style.borderColor = option.color ?? "";
    label.style.color = option.color ?? "";
  }
}

/**
 * Provides the swipe to the card and the answer field: wrap both. `onAnswer`
 * gets the option once the card has flown off.
 */
export function SwipeProvider({
  options,
  onAnswer,
  children,
}: {
  options: NominalOption[];
  onAnswer: (option: NominalOption) => void;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement | null>(null);
  const overlay = useRef<HTMLDivElement | null>(null);
  const flying = useRef(false);

  const flyOff = useCallback(
    (direction: SwipeDirection, from: { x: number; y: number } = { x: 0, y: 0 }) => {
      const option = optionFor(options, direction);
      if (!option || flying.current) return;
      const el = card.current;
      if (!el || prefersReducedMotion()) {
        onAnswer(option);
        return;
      }
      flying.current = true;
      const width = el.offsetWidth || 400;
      const to =
        direction === "left" ? { x: -width * 1.5, y: from.y } : direction === "right" ? { x: width * 1.5, y: from.y } : { x: from.x, y: -(el.offsetHeight || 600) * 1.5 };
      showOverlay(overlay.current, option, direction, 1);
      el.style.transition = `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms ease-in`;
      el.style.transform = transformFor(to.x, to.y);
      el.style.opacity = "0";
      window.setTimeout(() => {
        flying.current = false;
        onAnswer(option);
        // The next step replaces the card (it is keyed per step); should the
        // same card stay (e.g. the answer failed), it comes back.
        window.setTimeout(() => {
          el.style.transition = "none";
          el.style.transform = "";
          el.style.opacity = "";
          showOverlay(overlay.current, undefined, null, 0);
        }, 1000);
      }, FLY_MS);
    },
    [options, onAnswer],
  );

  const value = useMemo<SwipeState>(
    () => ({
      options,
      swipe: flyOff,
      register: (c, o) => {
        card.current = c;
        overlay.current = o;
      },
    }),
    [options, flyOff],
  );

  return <SwipeContext.Provider value={value}>{children}</SwipeContext.Provider>;
}

/**
 * The card: drag it to answer. Vertical scrolling of long content keeps
 * working: a swipe up only starts when the content can't scroll further
 * down (or fits). Renders its children as is when there is no swipe.
 */
export function SwipeCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const swipe = useSwipe();
  const card = useRef<HTMLDivElement | null>(null);
  const overlay = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; x: number; y: number; active: boolean } | null>(null);
  /** Whether an upward drag is a swipe (content at its bottom), which decides `touch-action`. */
  const [upAllowed, setUpAllowed] = useState(true);
  const hasUp = (swipe?.options.length ?? 0) >= 3;

  useEffect(() => {
    swipe?.register(card.current, overlay.current);
    return () => swipe?.register(null, null);
  }, [swipe]);

  // Track whether the scroll container around the card is at its bottom.
  useEffect(() => {
    if (!swipe || !hasUp) return;
    const scroller = scrollParent(card.current);
    if (!scroller) return;
    const update = () => setUpAllowed(scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(scroller);
    if (card.current) observer?.observe(card.current);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [swipe, hasUp]);

  if (!swipe) return <div className={className}>{children}</div>;

  const directionOf = (x: number, y: number): SwipeDirection | null => {
    if (Math.abs(x) >= Math.abs(y)) return x < 0 ? "left" : x > 0 ? "right" : null;
    return y < 0 && hasUp && upAllowed ? "up" : null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, x: 0, y: 0, active: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = card.current;
    if (!d || d.id !== e.pointerId || !el) return;
    d.x = e.clientX - d.x0;
    d.y = e.clientY - d.y0;
    if (!d.active) {
      if (Math.hypot(d.x, d.y) < DEAD_ZONE) return;
      // Vertical moves are scrolling, unless it's a swipe up at the bottom.
      if (Math.abs(d.y) > Math.abs(d.x) && !(d.y < 0 && hasUp && upAllowed)) {
        drag.current = null;
        return;
      }
      d.active = true;
      el.setPointerCapture(e.pointerId);
      el.style.transition = "none";
    }
    // Only the axis of the swipe moves the card: sideways, or up.
    const sideways = Math.abs(d.x) >= Math.abs(d.y) || !hasUp;
    const x = sideways ? d.x : d.x * 0.2;
    const y = sideways ? d.y * 0.2 : Math.min(0, d.y);
    el.style.transform = transformFor(x, y);
    const direction = directionOf(x, y);
    const strength = direction === "up" ? -y / UP_DISTANCE : Math.abs(x) / (el.offsetWidth * SIDEWAYS_SHARE);
    showOverlay(overlay.current, direction ? optionFor(swipe.options, direction) : undefined, direction, strength);
  };

  const end = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    const el = card.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active || !el) return;
    const sideways = Math.abs(d.x) >= Math.abs(d.y) || !hasUp;
    const x = sideways ? d.x : d.x * 0.2;
    const y = sideways ? d.y * 0.2 : Math.min(0, d.y);
    const direction = directionOf(x, y);
    const speed = Math.hypot(d.x, d.y) / Math.max(1, e.timeStamp - d.t0);
    const far = direction === "up" ? -y >= UP_DISTANCE : Math.abs(x) >= el.offsetWidth * SIDEWAYS_SHARE;
    const flung = speed >= FLING_SPEED && Math.hypot(x, y) >= FLING_MIN;
    if (!cancelled && direction && optionFor(swipe.options, direction) && (far || flung)) {
      swipe.swipe(direction, { x, y });
      return;
    }
    // Not far enough: back to the middle.
    el.style.transition = "transform 200ms ease-out";
    el.style.transform = "";
    showOverlay(overlay.current, undefined, null, 0);
  };

  return (
    <div
      ref={card}
      className={`relative select-none ${className}`}
      // Sideways is always ours; vertical scrolling stays the browser's, except
      // a swipe up when the content is at its bottom: then the browser only
      // scrolls back up ("pan-up" is the scroll direction: the finger moves down).
      style={{ touchAction: hasUp && upAllowed ? "pan-up pinch-zoom" : "pan-y pinch-zoom" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      data-swipe-card=""
    >
      {children}
      <div
        ref={overlay}
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-start justify-center rounded-[inherit] opacity-0 data-[direction=left]:justify-end data-[direction=right]:justify-start data-[direction=up]:items-end"
      >
        <span className="m-4 rounded-lg border-4 border-foreground bg-background/90 px-3 py-1 text-xl font-extrabold uppercase tracking-wide text-foreground shadow-lg" />
      </div>
    </div>
  );
}

/** The nearest ancestor that scrolls vertically. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === "auto" || overflow === "scroll") return p;
  }
  return null;
}
