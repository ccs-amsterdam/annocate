// Reading a topic's text, without the topics themselves (so the guide can
// use it without loading them): the front matter, heading ids, and links
// between topics.

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
