import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
  type UIEvent,
  type WheelEvent,
} from "react";

/**
 * Headers that get out of the way: scrolling down in any scroll area below
 * them (a page, the editor's tree or item panel) hides them; scrolling up
 * anywhere on the page (also where nothing scrolls), or back near the top,
 * shows them again. Keyboard focus in a header shows it.
 */
interface Chrome {
  collapsed: boolean;
  show: () => void;
}

const ChromeContext = createContext<Chrome>({ collapsed: false, show: () => {} });

/** Whether the headers are hidden now (and a way to show them, e.g. on focus). */
const useChrome = () => useContext(ChromeContext);

/** How far to scroll down before the headers hide, and how much movement counts. */
const HIDE_AFTER = 64;
const JITTER = 6;

/** Wraps a page: its scroll areas (any element that scrolls inside it) drive the headers in it. */
export function CollapsingChrome({ children, className }: { children: ReactNode; className?: string }) {
  const [collapsed, setCollapsedState] = useState(false);
  const last = useRef(new WeakMap<EventTarget, number>());
  // Hiding or showing the headers resizes the scroll areas (and may clamp their position): ignore that scroll
  const settling = useRef(0);
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState((now) => {
      if (now !== next) settling.current = Date.now() + 300;
      return next;
    });
  }, []);
  const onScroll = useCallback(
    (e: UIEvent) => {
      const el = e.target as HTMLElement;
      // Not for dialogs and popovers (portals still pass their events up the React tree)
      if (
        !(el instanceof HTMLElement) ||
        el.scrollHeight <= el.clientHeight ||
        el.closest('[role="dialog"], [data-radix-popper-content-wrapper]')
      )
        return;
      const top = el.scrollTop;
      const before = last.current.get(el) ?? 0;
      last.current.set(el, top);
      if (Math.abs(top - before) < JITTER || Date.now() < settling.current) return;
      if (top < HIDE_AFTER) setCollapsed(false);
      // Only worth it with enough to scroll (else hiding the headers alone makes it all fit)
      else if (el.scrollHeight - el.clientHeight > 2 * HIDE_AFTER || top < before) setCollapsed(top > before);
    },
    [setCollapsed],
  );
  const show = useCallback(() => setCollapsed(false), [setCollapsed]);
  // Scrolling up anywhere shows the headers, also over an area that doesn't scroll (else they could only come
  // back from the area that hid them)
  const onWheel = useCallback((e: WheelEvent) => e.deltaY < -JITTER && show(), [show]);
  const touchY = useRef<number | null>(null);
  const onTouchStart = useCallback((e: TouchEvent) => (touchY.current = e.touches[0]?.clientY ?? null), []);
  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      // A finger moving down scrolls up
      if (touchY.current !== null && y !== undefined && y - touchY.current > 4 * JITTER) show();
    },
    [show],
  );
  return (
    <ChromeContext.Provider value={{ collapsed, show }}>
      <div
        className={className}
        onScrollCapture={onScroll}
        onWheelCapture={onWheel}
        onTouchStartCapture={onTouchStart}
        onTouchMoveCapture={onTouchMove}
      >
        {children}
      </div>
    </ChromeContext.Provider>
  );
}

/** A header that collapses with the others: its height animates to 0 (no animation with reduced motion). */
export function CollapsibleHeader({ children, className }: { children: ReactNode; className?: string }) {
  const { collapsed, show } = useChrome();
  return (
    <div
      className={`grid shrink-0 transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"} ${className ?? ""}`}
      onFocusCapture={show}
      data-collapsed={collapsed || undefined}
    >
      {/* Still focusable when hidden: tabbing into it shows it */}
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
