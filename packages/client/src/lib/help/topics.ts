// The help topics: one markdown file per topic in ./topics, with a front
// matter block (title, section, order, summary). Links between topics are
// ordinary relative links (`[Snippets](snippets.md#names)`), so the files
// also read well on GitHub.

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
  "Codebook",
  "Question types",
  "Unit layouts",
  "Units and distribution",
  "Coders",
  "Results",
  "Design notes",
] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];

const files = import.meta.glob("./topics/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Splits a file into its front matter (`key: value` lines between `---` lines) and body. */
export function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

function toTopic(path: string, raw: string): HelpTopic {
  const slug = path.replace(/^.*\//, "").replace(/\.md$/, "");
  const { meta, body } = parseFrontMatter(raw);
  const section = meta.section as HelpSection;
  if (!meta.title || !HELP_SECTIONS.includes(section)) throw new Error(`Help topic ${slug}: needs a title and one of the sections`);
  return { slug, title: meta.title, section, order: Number(meta.order ?? 99), summary: meta.summary ?? "", body };
}

/** All topics, by section and order. */
export const HELP_TOPICS: HelpTopic[] = Object.entries(files)
  .map(([path, raw]) => toTopic(path, raw))
  .sort((a, b) => HELP_SECTIONS.indexOf(a.section) - HELP_SECTIONS.indexOf(b.section) || a.order - b.order || a.title.localeCompare(b.title));

export function helpTopic(slug: string): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.slug === slug);
}

/** A heading's id: lower case, words joined with `-` (as GitHub does). */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** A link to another topic (`snippets.md`, `snippets.md#names`, `#names` on the same page), or null for other links. */
export function helpLink(href: string, from: string): { slug: string; anchor?: string } | null {
  const match = /^(?:\.\/)?([a-z0-9-]+)\.md(?:#(.+))?$/.exec(href);
  if (match) return match[2] ? { slug: match[1], anchor: match[2] } : { slug: match[1] };
  if (href.startsWith("#")) return { slug: from, anchor: href.slice(1) };
  return null;
}
