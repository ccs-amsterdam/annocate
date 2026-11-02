import { codeRanges } from "./references.js";

// Snippets (docs/client.md §3, "Snippets"): named pieces of a unit loop's
// template (`layout.snippets`), written `[[name]]` and pasted in as text
// before anything else is read, wherever they stand: a line, a block's
// fence (`::: if [[condition]]`), inside `{{ }}`. Markdown, blocks and
// values in them all work. A snippet takes no suffix (it isn't a value).
// Names must be written out literally (no `"[[" + name + "]]"`).

const SNIPPET = /\[\[([A-Za-z_][A-Za-z0-9_]*)\]\]/g;

/** Whether a template uses snippets (outside code). */
export function usesSnippets(source: string): boolean {
  return snippetMatches(source).length > 0;
}

function snippetMatches(source: string): RegExpExecArray[] {
  if (!source.includes("[[")) return [];
  const code = codeRanges(source);
  return [...source.matchAll(SNIPPET)].filter((m) => !code.some(([s, e]) => m.index >= s && m.index < e));
}

/**
 * A template with its `[[name]]`s replaced by the snippets' text (snippets
 * may use snippets); snippets in code stay as they are. Unknown snippets,
 * snippets that include themselves and a suffix after a snippet are errors;
 * unknown and self-including ones are left out.
 */
export function expandSnippets(
  source: string,
  snippets: Readonly<Record<string, string>> | undefined,
  using: readonly string[] = [],
): { source: string; errors: string[] } {
  const matches = snippetMatches(source);
  if (matches.length === 0) return { source, errors: [] };
  const errors: string[] = [];
  let out = "";
  let last = 0;
  for (const m of matches) {
    out += source.slice(last, m.index);
    last = m.index + m[0].length;
    const name = m[1];
    const text = snippets?.[name];
    const suffix = /^::([A-Za-z]+)/.exec(source.slice(last));
    if (suffix) errors.push(`[[${name}]]::${suffix[1]}: a snippet takes no suffix (it is pasted into the template as it is)`);
    if (text === undefined) errors.push(`[[${name}]]: there is no snippet '${name}' in this loop's layout`);
    else if (using.includes(name)) errors.push(`[[${name}]]: the snippet includes itself (${[...using, name].join(" → ")})`);
    else {
      const inner = expandSnippets(text, snippets, [...using, name]);
      errors.push(...inner.errors);
      out += inner.source;
    }
  }
  return { source: out + source.slice(last), errors: [...new Set(errors)] };
}
