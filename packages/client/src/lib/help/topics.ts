// The help topics: one markdown file per topic in ./topics, with a front
// matter block (title, section, order, summary). Links between topics are
// ordinary relative links (`[Snippets](snippets.md#names)`), so the files
// also read well on GitHub.

import { parseFrontMatter } from "./topicText";

export { headingId, helpLink, parseFrontMatter } from "./topicText";

export interface HelpTopic {
  slug: string;
  title: string;
  section: HelpSection;
  /** Position within its section. */
  order: number;
  /** One sentence, shown under the title and in the topic menu. */
  summary: string;
  body: string;
}

/** The sections of the help, in order. */
export const HELP_SECTIONS = [
  "Getting started",
  "Editor",
  "Question types",
  "Unit layouts",
  "Units and distribution",
  "Coders",
  "Results",
  "Design notes",
] as const;
type HelpSection = (typeof HELP_SECTIONS)[number];

const files = import.meta.glob("./topics/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

function toTopic(path: string, raw: string): HelpTopic {
  const slug = path.replace(/^.*\//, "").replace(/\.md$/, "");
  const { meta, body } = parseFrontMatter(raw);
  const section = meta.section as HelpSection;
  if (!meta.title || !HELP_SECTIONS.includes(section))
    throw new Error(`Help topic ${slug}: needs a title and one of the sections`);
  return { slug, title: meta.title, section, order: Number(meta.order ?? 99), summary: meta.summary ?? "", body };
}

/** All topics, by section and order. */
export const HELP_TOPICS: HelpTopic[] = Object.entries(files)
  .map(([path, raw]) => toTopic(path, raw))
  .sort(
    (a, b) =>
      HELP_SECTIONS.indexOf(a.section) - HELP_SECTIONS.indexOf(b.section) ||
      a.order - b.order ||
      a.title.localeCompare(b.title),
  );

export function helpTopic(slug: string): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.slug === slug);
}
