import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

const STORAGE_KEY = "annocate_docked_pane_height";
const MIN_HEIGHT = 100;
/** Room left below the content, so small changes don't flash a scrollbar. */
const SLACK = 8;

function savedHeight(): number | null {
  if (typeof window === "undefined") return null;
  const num = parseInt(localStorage.getItem(STORAGE_KEY) ?? "", 10);
  return Number.isNaN(num) || num < MIN_HEIGHT ? null : num;
}

/**
 * Docked answer form below the unit document. By default its height follows
 * its content (up to half the runner's height, `cqh` of the container set by
 * the parent), with a transition. Only the bottom of the document moves, and
 * both scroll areas keep a stable scrollbar gutter, so the unit text stays put.
 * Dragging the handle sets a custom height (kept in localStorage); the "Auto"
 * button or a double click on the handle returns to following the content.
 */
export function DockedAnswerPane({ children }: { children: ReactNode }) {
  const [customHeight, setCustomHeight] = useState<number | null>(savedHeight);
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto height: the content plus the handle, the scroll area's padding and the border.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (customHeight !== null || !pane || !scroller || !content || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const style = getComputedStyle(scroller);
      const chrome =
        (handleRef.current?.offsetHeight ?? 0) +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        parseFloat(getComputedStyle(pane).borderTopWidth);
      setAutoHeight(Math.max(MIN_HEIGHT, Math.ceil(content.offsetHeight + chrome + SLACK)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [customHeight]);

  useEffect(() => {
    if (!dragging) return;
    const pane = paneRef.current;
    const container = pane?.parentElement;
    if (!pane || !container) return;
    let latest = pane.offsetHeight;
    const move = (clientY: number) => {
      const box = container.getBoundingClientRect();
      latest = Math.round(Math.max(MIN_HEIGHT, Math.min(box.height * 0.75, box.bottom - clientY)));
      setCustomHeight(latest);
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) move(e.touches[0].clientY);
    };
    const onEnd = () => {
      setDragging(false);
      localStorage.setItem(STORAGE_KEY, String(latest));
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onEnd);
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [dragging]);

  function startDragging(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function resetToAuto() {
    localStorage.removeItem(STORAGE_KEY);
    setCustomHeight(null);
  }

  const custom = customHeight !== null;
  const height = custom ? customHeight : autoHeight;

  return (
    <div
      ref={paneRef}
      style={height === null ? undefined : { height: `${height}px` }}
      className={`relative z-10 flex min-h-0 shrink-0 flex-col border-t border-border bg-card/95 shadow-lg backdrop-blur ${
        custom ? "max-h-[75cqh]" : "max-h-[50cqh]"
      } ${dragging ? "" : "transition-[height] duration-200 ease-out"}`}
    >
      {/* Drag handle: a tall touch target. Dragging sets a custom height. */}
      <div
        ref={handleRef}
        onMouseDown={startDragging}
        onTouchStart={startDragging}
        onDoubleClick={custom ? resetToAuto : undefined}
        className="group flex h-5 w-full shrink-0 cursor-row-resize select-none items-center justify-center transition-colors hover:bg-primary/15 active:bg-primary/25 sm:h-6"
        title={custom ? "Drag to resize, double click to fit the answer form" : "Drag to resize answer panel"}
        role="separator"
        aria-orientation="horizontal"
      >
        <div className="h-1.5 w-12 rounded-full bg-border transition-colors group-hover:bg-primary/60 sm:w-14" />
      </div>
      {custom && (
        <button
          type="button"
          onClick={resetToAuto}
          className="absolute right-2 top-0.5 z-10 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground sm:top-1"
          title="Fit the panel to the answer form again"
        >
          <RotateCcw className="size-3" />
          Auto
        </button>
      )}

      <div
        ref={scrollRef}
        className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-3.5 pb-2.5 pt-0.5 [scrollbar-gutter:stable_both-edges] sm:px-6 sm:pb-3.5 sm:pt-1"
      >
        <div ref={contentRef} className="mx-auto w-full max-w-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
