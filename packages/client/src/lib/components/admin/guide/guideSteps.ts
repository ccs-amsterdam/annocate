import type { TabId } from "../../../admin/tabs";
import { parseGuideSection, type GuideSection } from "./parseGuide";

// The guide (docs/client.md §7, "Guide"): a section per page, each a few
// steps, in one flow. A step says one thing in a few lines, shows it (the
// sample study drawn with the real pages, read only) and can point at the
// real button on the researcher's own page ("Show me": an element with that
// `data-guide` attribute). The sections are the Markdown files in ./content
// (`parseGuide.ts` has their format).

const files = import.meta.glob("./content/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

export const GUIDE_SECTIONS: GuideSection[] = Object.entries(files)
  .map(([path, raw]) => parseGuideSection(raw, path.replace(/^.*\//, "")))
  .sort((a, b) => a.order - b.order);

/** The section a page's guide opens on (a page without one: the start). */
export function sectionIndexOf(page: TabId): number {
  const at = GUIDE_SECTIONS.findIndex((s) => s.page === page);
  return at >= 0 ? at : 0;
}

/** Every step in order, with its section: Next and Back go through these. */
export const GUIDE_FLOW = GUIDE_SECTIONS.flatMap((section, s) => section.steps.map((step, i) => ({ s, i, step })));
