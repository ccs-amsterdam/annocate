import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignEditor } from "../DesignEditor";
import { sampleClient, sampleDesign } from "./sampleStudy";
import { SamplePagePicture } from "./SamplePages";
import type { GuideSample as Sample } from "./parseGuide";
import { pictureOf, type Marker } from "./pictures";

/** The sample study's data: its own, never mixed with the researcher's study. */
const queries = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
const client = sampleClient();

function SampleEditor({ select }: { select?: string }) {
  return (
    <DesignEditor
      client={client}
      // Not deployed: who codes is the design's choice
      coderKind={null}
      version={sampleDesign()}
      mode="history"
      wideLayout
      initialSelect={select}
      onSaved={() => {}}
    />
  );
}

/** The smallest scale a picture is given for the height's sake. */
const READABLE = 0.6;

/** The size of the space an element has, kept up to date. */
function useRoom(box: RefObject<HTMLElement | null>): { w: number; h: number } | null {
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [box]);
  return room;
}

/**
 * A step's picture: the sample study drawn with the real pages (the design
 * editor, wide, with an item selected: all of it with its parts numbered, or
 * one part of it; a page or its table with sample data), scaled to fit the
 * space (never larger than drawn). Where the space is too low for a picture
 * that can be read, it takes the width and goes past the space: the step
 * scrolls. Inert: it can't be clicked or focused, so nothing changes.
 */
export function GuideSample({ sample }: { sample: Sample }) {
  const box = useRef<HTMLDivElement>(null);
  const room = useRoom(box);
  const { drawn, x, y, width, height, markers } = pictureOf(sample);
  const scale = room ? Math.min(1, room.w / width, Math.max(room.h / height, READABLE)) : 0;

  return (
    <div ref={box} className="flex h-full w-full items-start justify-center">
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-page"
        style={{ width: width * scale, height: height * scale }}
        aria-label="The sample study"
        role="img"
      >
        <div
          inert
          className="absolute p-3"
          style={{
            left: -x * scale,
            top: -y * scale,
            ...drawn,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <QueryClientProvider client={queries}>
            {sample.show === "design" ? (
              <SampleEditor select={sample.select} />
            ) : (
              <SamplePagePicture show={sample.show} client={client} />
            )}
          </QueryClientProvider>
        </div>
        {markers.map((marker, i) => (
          <PartMarker key={i} number={i + 1} marker={marker} scale={scale} />
        ))}
      </div>
    </div>
  );
}

/** An outline around a part of the picture, with its number (as the step's numbered list has it). */
function PartMarker({ number, marker, scale }: { number: number; marker: Marker; scale: number }) {
  return (
    <div
      className="absolute rounded-lg border-2 border-ember"
      style={{
        left: marker.x * scale,
        top: marker.y * scale,
        width: marker.width * scale,
        height: marker.height * scale,
      }}
    >
      <span className="guide-number absolute -top-3 left-3">{number}</span>
    </div>
  );
}
