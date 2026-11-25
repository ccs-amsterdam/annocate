import type { DesignFocus, GuideSample, SamplePage } from "./parseGuide";

// The sizes of the guide's pictures (`GuideSample.tsx`): what each is drawn
// at before it is scaled to fit, and the part of it that shows.

/** A part of a picture, outlined with its number: where it is in the drawn size. */
export interface Marker {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Picture {
  /** The size it is drawn at. */
  drawn: { width: number; height: number };
  /** The part of it shown (the rest is cut off). */
  x: number;
  y: number;
  width: number;
  height: number;
  markers: Marker[];
}

/** The design editor is drawn as on a wide window: tree, form and preview side by side. */
const EDITOR = { width: 1500, height: 760 };
/** Where its panels start, below the toolbar. */
const PANELS_TOP = 48;
/**
 * The part of the editor each focus shows: all of it, or some of its panels.
 * Its columns are 1fr 1.15fr 1fr, between 12px padding and gaps.
 */
const FOCUS: Record<DesignFocus, { x: number; y: number; width: number }> = {
  overview: { x: 0, y: 0, width: EDITOR.width },
  tree: { x: 0, y: PANELS_TOP, width: 485 },
  item: { x: 473, y: PANELS_TOP, width: 1027 },
  form: { x: 473, y: PANELS_TOP, width: 554 },
};
/** The overview's two parts: 1 the tree, 2 the item editor (form and preview). */
const PARTS_HEIGHT = EDITOR.height - PANELS_TOP - 12;
const EDITOR_PARTS: Marker[] = [
  { x: 6, y: PANELS_TOP + 6, width: 473, height: PARTS_HEIGHT },
  { x: 479, y: PANELS_TOP + 6, width: 1015, height: PARTS_HEIGHT },
];

/** The size each page's picture (`SamplePages.tsx`) is drawn at: change it with what the picture holds. */
const PAGE_SIZES: Record<SamplePage, { width: number; height: number }> = {
  map: { width: 760, height: 130 },
  units: { width: 1100, height: 360 },
  "add-coders": { width: 520, height: 330 },
  coders: { width: 900, height: 230 },
  deploy: { width: 720, height: 420 },
  links: { width: 900, height: 190 },
  results: { width: 768, height: 420 },
};

export function pictureOf(sample: GuideSample): Picture {
  if (sample.show !== "design")
    return { drawn: PAGE_SIZES[sample.show], x: 0, y: 0, ...PAGE_SIZES[sample.show], markers: [] };
  const shown = FOCUS[sample.focus];
  return {
    drawn: EDITOR,
    ...shown,
    height: EDITOR.height - shown.y,
    markers: sample.focus === "overview" ? EDITOR_PARTS : [],
  };
}

/** Taller than wide: the step's text fits beside it (`GuideDialog`). */
export function isTallSample(sample: GuideSample): boolean {
  const { width, height } = pictureOf(sample);
  return height > width;
}
