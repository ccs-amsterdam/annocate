import { TAB_SLUGS, type TabId } from "../../../admin/tabs";
import { parseFrontMatter } from "../../../help/topicText";

// Reading the guide's content (docs/client.md §7, "Guide"): a Markdown file
// per section in ./content. Its front matter names the section (title, the
// page it is about, its order); each `## Title {#id}` heading starts a step.
// The line under a heading may be an HTML comment saying what the step shows
// and where "Show me" goes; the rest is the step's text.
//
//   ## The tree {#tree}
//   <!-- show: design, focus: tree, select: topic; show me: Design / add-item / Add item -->
//   - The tree is the coder's path.

/** The part of the sample's design editor a step shows. */
export const DESIGN_FOCUSES = ["overview", "tree", "item", "form"] as const;
export type DesignFocus = (typeof DESIGN_FOCUSES)[number];

/** The other pictures: the five steps of a study, and a page with sample data. */
export const SAMPLE_PAGES = ["map", "units", "add-coders", "coders", "deploy", "links", "results"] as const;
export type SamplePage = (typeof SAMPLE_PAGES)[number];

/** What a step shows. */
export type GuideSample =
  | {
      show: "design";
      /** The whole editor with its parts marked, its tree, an item's form and preview, or its form only. */
      focus: DesignFocus;
      /** The item selected, by name (`session`: who codes). */
      select?: string;
    }
  | { show: SamplePage };

export interface GuideStep {
  id: string;
  title: string;
  /** Markdown: a few short lines or bullets. */
  body: string;
  sample?: GuideSample;
  /** The real thing on the researcher's page: the page it is on, and its `data-guide` name. */
  showMe?: { page: TabId; target: string; label: string };
}

export interface GuideSection {
  /** The page the section is about: the guide opens on it there. */
  page: TabId;
  title: string;
  /** Its place among the sections. */
  order: number;
  steps: GuideStep[];
}

const HEADING = /^## +(.*)$/;
const TITLE_AND_ID = /^(.+?) +\{#([a-z0-9-]+)\}$/;

const isTab = (page: string | undefined): page is TabId => page !== undefined && page in TAB_SLUGS;
const isOneOf = <T extends string>(list: readonly T[], value: string | undefined): value is T =>
  list.includes(value as T);

/** `show: design, focus: tree` as its keys and values. */
function parsePairs(text: string, where: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const part of text.split(",")) {
    const at = part.indexOf(":");
    if (at < 0) throw new Error(`${where}: "${part.trim()}" should be "key: value"`);
    pairs[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return pairs;
}

function parseSample(text: string, where: string): GuideSample {
  const { show, focus, select, ...unknown } = parsePairs(text, where);
  const extra = Object.keys(unknown)[0];
  if (extra) throw new Error(`${where}: unknown "${extra}"`);
  if (show === "design") {
    if (!isOneOf(DESIGN_FOCUSES, focus)) throw new Error(`${where}: focus is one of ${DESIGN_FOCUSES.join(", ")}`);
    return select ? { show, focus, select } : { show, focus };
  }
  if (!isOneOf(SAMPLE_PAGES, show)) throw new Error(`${where}: show is design or one of ${SAMPLE_PAGES.join(", ")}`);
  if (focus || select) throw new Error(`${where}: focus and select go with "show: design"`);
  return { show };
}

/** `Design / add-item / Add item: a question` as the page, the element's `data-guide` name and what to say. */
function parseShowMe(text: string, where: string): GuideStep["showMe"] {
  const [page, target, ...label] = text.split(" / ").map((part) => part.trim());
  if (!isTab(page) || !target || label.length === 0)
    throw new Error(`${where}: show me is "Page / data-guide name / What it says"`);
  return { page, target, label: label.join(" / ") };
}

/** A step's comment line: `show: …`, `show me: …`, or both with a `;` between. */
function parseDirective(comment: string, where: string): Pick<GuideStep, "sample" | "showMe"> {
  const step: Pick<GuideStep, "sample" | "showMe"> = {};
  for (const clause of comment.split(";").map((c) => c.trim())) {
    if (clause.startsWith("show me:")) step.showMe = parseShowMe(clause.slice("show me:".length), where);
    else if (clause.startsWith("show:")) step.sample = parseSample(clause, where);
    else throw new Error(`${where}: the comment starts with "show:" or "show me:"`);
  }
  return step;
}

/** A line that is a whole HTML comment (`<!-- ... -->`): its text, trimmed; else null. */
function commentText(line: string | undefined): string | null {
  const text = line?.trim() ?? "";
  if (!text.startsWith("<!--") || !text.endsWith("-->") || text.length < 7) return null;
  return text.slice(4, -3).trim();
}

function parseStep(heading: string, lines: string[], file: string): GuideStep {
  const match = TITLE_AND_ID.exec(heading.trim());
  if (!match) throw new Error(`${file}: "## ${heading}" needs an id, as in "## Title {#id}"`);
  const [, title, id] = match;
  const comment = commentText(lines[0]);
  const directive = comment !== null ? parseDirective(comment, `${file} #${id}`) : {};
  const body = lines
    .slice(comment !== null ? 1 : 0)
    .join("\n")
    .trim();
  if (!body) throw new Error(`${file} #${id}: the step has no text`);
  return { id, title, body, ...directive };
}

/** The steps of a section's text: each heading with the lines under it. Text before the first heading (a note on the format) isn't a step. */
function parseSteps(body: string, file: string): GuideStep[] {
  const steps: GuideStep[] = [];
  let open: { heading: string; lines: string[] } | null = null;
  const close = () => open && steps.push(parseStep(open.heading, open.lines, file));
  for (const line of body.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      open = { heading: heading[1], lines: [] };
    } else open?.lines.push(line);
  }
  close();
  return steps;
}

/** A section file as its section and steps; an error says what is wrong and where. */
export function parseGuideSection(raw: string, file: string): GuideSection {
  const { meta, body } = parseFrontMatter(raw);
  const order = Number(meta.order);
  if (!meta.title || !isTab(meta.page) || !Number.isFinite(order))
    throw new Error(
      `${file}: the front matter needs a title, a page (${Object.keys(TAB_SLUGS).join(", ")}) and an order`,
    );
  const steps = parseSteps(body, file);
  if (steps.length === 0) throw new Error(`${file}: no steps ("## Title {#id}")`);
  return { page: meta.page, title: meta.title, order, steps };
}
