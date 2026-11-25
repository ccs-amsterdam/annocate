import { useLayoutEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignEditor } from "../DesignEditor";
import { UnitsPage } from "../units/UnitsPage";
import { sampleClient, sampleDesign } from "./sampleStudy";
import type { CoderKind } from "@annotinder/contracts";
import type { GuideSample as Sample } from "./guideSteps";

/** The size the sample is drawn at (a wide window), before it is scaled to fit. */
const WIDTH = 1500;
const HEIGHTS: Record<Sample["page"], number> = { design: 760, units: 360 };
/**
 * The part of the design editor a step shows (x and width, in the drawn
 * size): its three columns (1fr 1.15fr 1fr, between 12px padding and gaps).
 */
const VIEWS = { full: [0, WIDTH], tree: [0, 487], form: [473, 554] } as const;

/** The sample study with a design for a crowd, and with one for expert coders: each its own data, never mixed with the researcher's study. */
const sampleOf = (coderKind: CoderKind) => ({
  queries: new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
  client: sampleClient(coderKind),
});
const SAMPLES = { crowd: sampleOf("crowd"), expert: sampleOf("expert") };

/**
 * A step's picture: the sample study drawn with the real page (the design
 * editor, wide, with an item selected, or only its tree or its form; the
 * Units page), scaled to fit the space (never larger than drawn). Inert: it
 * can't be clicked or focused, so nothing changes.
 */
export function GuideSample({ sample }: { sample: Sample }) {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = HEIGHTS[sample.page];
  const [x, width] = sample.page === "design" ? VIEWS[sample.view ?? "full"] : VIEWS.full;
  const scale = room ? Math.min(1, room.w / width, room.h / height) : 0;
  const coderKind = (sample.page === "design" && sample.coders) || "crowd";
  const { queries, client } = SAMPLES[coderKind];

  return (
    <div ref={box} className="flex h-full w-full items-start justify-center overflow-hidden">
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-page"
        style={{ width: width * scale, height: height * scale }}
        aria-label="The sample study"
        role="img"
      >
        <div
          inert
          className="absolute top-0 p-3"
          style={{
            left: -x * scale,
            width: WIDTH,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <QueryClientProvider client={queries}>
            {sample.page === "design" ? (
              <DesignEditor
                // A fresh editor per sample: its selection is the step's
                key={`${coderKind}:${sample.select ?? "none"}`}
                client={client}
                // Not deployed: who codes is the design's choice
                coderKind={null}
                version={sampleDesign(coderKind)}
                mode="history"
                wideLayout
                initialSelect={sample.select}
                onSaved={() => {}}
              />
            ) : (
              <UnitsPage client={client} onOpenCoders={() => {}} />
            )}
          </QueryClientProvider>
        </div>
      </div>
    </div>
  );
}
