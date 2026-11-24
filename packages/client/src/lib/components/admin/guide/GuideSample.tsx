import { useLayoutEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignEditor } from "../DesignEditor";
import { UnitsPage } from "../units/UnitsPage";
import { SAMPLE_DESIGN, sampleClient } from "./sampleStudy";
import type { GuideSample as Sample } from "./guideSteps";

/** The size the sample is drawn at, then scaled to fit: a wide window (the Units page needs less height). */
const WIDTH = 1500;
const HEIGHTS: Record<Sample["page"], number> = { design: 760, units: 360 };

// The sample's own data: its queries never mix with the researcher's study
const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
const client = sampleClient();

/**
 * A step's picture: the sample study drawn with the real page (the design
 * editor, wide, with an item selected; the Units page), scaled down to the
 * dialog's width. Inert: it can't be clicked or focused, so nothing changes.
 */
export function GuideSample({ sample }: { sample: Sample }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const height = HEIGHTS[sample.page];
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / WIDTH));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-lg border border-border bg-page"
      style={{ height: height * scale }}
      aria-label="The sample study"
      role="img"
    >
      <div
        inert
        className="absolute top-0 left-0 p-3"
        style={{ width: WIDTH, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <QueryClientProvider client={queries}>
          {sample.page === "design" ? (
            <DesignEditor
              // A fresh editor per step: its selection is the step's
              key={sample.select ?? "none"}
              client={client}
              version={SAMPLE_DESIGN}
              mode="history"
              wideLayout
              initialSelect={sample.select}
              onSaved={() => {}}
            />
          ) : (
            <UnitsPage client={client} />
          )}
        </QueryClientProvider>
      </div>
    </div>
  );
}
