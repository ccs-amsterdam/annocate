import { codeRanges } from "./references.js";
import { own } from "../common.js";

// Snippets (docs/client.md §3, "Snippets"): named pieces of a unit loop's
// template (`layout.snippets`), written `[[name]]` and pasted in as text
// before anything else is read, wherever they stand: a line, a block's
// fence (`::: if [[condition]]`), inside `{{ }}`. Markdown, blocks and
// values in them all work. A snippet takes no suffix (it isn't a value).
// Names must be written out literally (no `"[[" + name + "]]"`).

const SNIPPET = /\[\[([A-Za-z][A-Za-z0-9_]*)\]\]/g;

/** Whether a template uses snippets (outside code). */
export function usesSnippets(source: string): boolean {
  return snippetMatches(source).length > 0;
}

function snippetMatches(source: string): RegExpExecArray[] {
  if (!source.includes("[[")) return [];
  const code = codeRanges(source);
  return [...source.matchAll(SNIPPET)].filter((m) => !code.some(([s, e]) => m.index >= s && m.index < e));
}

/** A snippet's text; undefined for an unknown snippet (and for one that is not text). */
function snippetText(snippets: Readonly<Record<string, string>> | undefined, name: string): string | undefined {
  const text: unknown = own(snippets, name);
  return typeof text === "string" ? text : undefined;
}

/**
 * The most text snippets may put into one template. Snippets that use
 * snippets multiply: each level that uses the next one twice doubles the
 * text, so a few short snippets can ask for gigabytes.
 */
export const MAX_SNIPPET_TEXT = 200_000;

const TOO_LARGE = `The snippets put more than ${MAX_SNIPPET_TEXT / 1000} kB of text into this template: use fewer snippets in snippets`;

/**
 * A template with its `[[name]]`s replaced by the snippets' text (snippets
 * may use snippets); snippets in code stay as they are. Unknown snippets,
 * snippets that include themselves and a suffix after a snippet are errors;
 * unknown and self-including ones are left out. `tooLarge`: the snippets
 * put in more than MAX_SNIPPET_TEXT; the source is then cut off where that
 * happened, and that is the only error.
 */
export function expandSnippets(
  source: string,
  snippets: Readonly<Record<string, string>> | undefined,
): { source: string; errors: string[]; tooLarge: boolean } {
  const room: Room = { left: MAX_SNIPPET_TEXT, matches: new Map() };
  const expanded = expand(source, snippets, [], room);
  if (room.left < 0) return { source: expanded.source, errors: [TOO_LARGE], tooLarge: true };
  return { ...expanded, tooLarge: false };
}

/** One expansion's state: how much text snippets may still add, and where each text has its snippets (read once per text). */
interface Room {
  left: number;
  matches: Map<string, RegExpExecArray[]>;
}

function matchesIn(source: string, room: Room): RegExpExecArray[] {
  let matches = room.matches.get(source);
  if (!matches) room.matches.set(source, (matches = snippetMatches(source)));
  return matches;
}

/** `expandSnippets` for a template or a snippet's text (`using`: the snippets it is in); stops when `room` runs out. */
function expand(
  source: string,
  snippets: Readonly<Record<string, string>> | undefined,
  using: readonly string[],
  room: Room,
): { source: string; errors: string[] } {
  const matches = matchesIn(source, room);
  if (matches.length === 0) return { source, errors: [] };
  const errors: string[] = [];
  let out = "";
  let last = 0;
  for (const m of matches) {
    out += source.slice(last, m.index);
    last = m.index + m[0].length;
    const name = m[1];
    const text = snippetText(snippets, name);
    const suffix = /^::([A-Za-z]+)/.exec(source.slice(last));
    if (suffix)
      errors.push(`[[${name}]]::${suffix[1]}: a snippet takes no suffix (it is pasted into the template as it is)`);
    if (text === undefined) errors.push(`[[${name}]]: there is no snippet '${name}' in this loop's layout`);
    else if (using.includes(name))
      errors.push(`[[${name}]]: the snippet includes itself (${[...using, name].join(" → ")})`);
    else {
      room.left -= text.length;
      if (room.left < 0) return { source: out, errors };
      const inner = expand(text, snippets, [...using, name], room);
      errors.push(...inner.errors);
      out += inner.source;
      if (room.left < 0) return { source: out, errors };
    }
  }
  return { source: out + source.slice(last), errors: [...new Set(errors)] };
}
