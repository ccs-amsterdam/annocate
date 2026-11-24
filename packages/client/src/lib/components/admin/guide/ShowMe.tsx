import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { endShowMe, useShowMe, type ShowMeTarget } from "./guideStore";

/**
 * "Show me": a ring around a real element of the page (its `data-guide`
 * name), with what it is. Nothing is blocked: clicking anywhere ends it,
 * and the element itself works as always. If the element isn't there (e.g.
 * the editor shows an item's form on a phone), says so.
 */
export function ShowMe() {
  const showMe = useShowMe();
  // A fresh pointer per target
  return showMe ? <Pointer key={`${showMe.target}:${showMe.label}`} showMe={showMe} /> : null;
}

function Pointer({ showMe }: { showMe: ShowMeTarget }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let scrolled = false;
    const started = performance.now();
    const track = () => {
      const el = document.querySelector<HTMLElement>(`[data-guide="${showMe.target}"]`);
      if (el) {
        if (!scrolled) {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          scrolled = true;
        }
        setRect(el.getBoundingClientRect());
      } else if (performance.now() - started > 2000) setMissing(true);
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    // A click elsewhere ends it (and does what it does)
    const end = (e: PointerEvent) => {
      if (!bubble.current?.contains(e.target as Node)) endShowMe();
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && endShowMe();
    window.addEventListener("pointerdown", end, true);
    window.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", end, true);
      window.removeEventListener("keydown", escape);
    };
  }, [showMe]);

  if (!rect && !missing) return null;
  const pad = 6;
  const below = rect ? rect.bottom + 12 + 120 < window.innerHeight : true;
  const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 328)) : 16;
  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] animate-pulse rounded-lg ring-4 ring-ember ring-offset-2 ring-offset-background"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      )}
      <div
        ref={bubble}
        role="status"
        className="fixed z-[61] flex w-80 flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm shadow-lg"
        style={
          rect
            ? below
              ? { top: rect.bottom + pad + 8, left }
              : { top: Math.max(8, rect.top - pad - 8 - 104), left }
            : { bottom: 16, left: 16 }
        }
      >
        <p>{missing ? `${showMe.label}: not on this screen right now.` : showMe.label}</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => endShowMe(true)}>
            Back to the guide
          </Button>
          <Button size="sm" onClick={() => endShowMe()}>
            Got it
          </Button>
        </div>
      </div>
    </>
  );
}
