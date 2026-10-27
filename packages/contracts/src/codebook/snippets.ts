import { codeRanges } from "./references.js";

// Snippets (docs/client.md §3, "Snippets"): named pieces of a unit loop's
// template (`layout.snippets`), inserted with `$snippet.<name>` as if they
// were typed there, before anything else is read: markdown, blocks and
// `$unit`/`$var` values in them all work. They replace the old constants
// (`$const.<name>`, migrated by `migrateConstants`).

const SNIPPET_REF = /\\?\$snippet\.([A-Za-z_][A-Za-z0-9_]*)/g;

/** The names of the snippets a template uses (directly). */
export function snippetNames(source: string): string[] {
  const code = codeRanges(source);
  const names: string[] = [];
  for (const m of source.matchAll(SNIPPET_REF)) {
    if (m[0].startsWith("\\") || code.some(([s, e]) => m.index >= s && m.index < e)) continue;
    names.push(m[1]);
  }
  return names;
}

/**
 * A template with its `$snippet.<name>`s replaced by the snippets' text
 * (snippets may use snippets); `\$snippet` and snippets in code stay as they
 * are. Unknown snippets and snippets that include themselves are errors and
 * are left out.
 */
export function expandSnippets(
  source: string,
  snippets: Readonly<Record<string, string>> | undefined,
  using: readonly string[] = [],
): { source: string; errors: string[] } {
  if (!source.includes("$snippet")) return { source, errors: [] };
  const errors: string[] = [];
  const code = codeRanges(source);
  let out = "";
  let last = 0;
  for (const m of source.matchAll(SNIPPET_REF)) {
    if (m[0].startsWith("\\") || code.some(([s, e]) => m.index >= s && m.index < e)) continue;
    out += source.slice(last, m.index);
    last = m.index + m[0].length;
    const name = m[1];
    const text = snippets?.[name];
    if (text === undefined) errors.push(`$snippet.${name}: there is no snippet '${name}' in this loop's layout`);
    else if (using.includes(name)) errors.push(`$snippet.${name}: the snippet includes itself (${[...using, name].join(" → ")})`);
    else {
      const inner = expandSnippets(text, snippets, [...using, name]);
      errors.push(...inner.errors);
      out += inner.source;
    }
  }
  return { source: out + source.slice(last), errors: [...new Set(errors)] };
}

const CONST_VALUE = /\{\{\s*\$const\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}(?:::(?:text|markdown|tokenize))?|\$const\.([A-Za-z_][A-Za-z0-9_]*)(?:::(?:text|markdown|tokenize))?/g;

/** A template's `$const.x` values (bare, or alone in `{{ }}`) as `$snippet.x`; other uses (in scripts) stay, and validation reports them. */
export function constantsToSnippets(template: string): string {
  return template.replace(CONST_VALUE, (_, a: string | undefined, b: string | undefined) => `$snippet.${a ?? b}`);
}
