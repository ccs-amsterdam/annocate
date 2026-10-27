import { unitLoops, type CodebookItem } from "./item.js";
import { extractReferences, type Reference } from "./references.js";
import { expandSnippets } from "./snippets.js";
import { allTemplateReferences } from "./templateBlocks.js";

/**
 * The unit fields a codebook shows or uses (docs/architecture.md §8.4): every
 * `$unit.<field>` in a loop's layout (with its snippets), question texts,
 * conditions and end messages, the layout's meta fields, and the columns of
 * span questions. Coders are sent only these fields,
 * and a unit version is a unit as it looks with them. References are
 * always literal (validation refuses `$unit[...]`), so the list is complete.
 */
export function shownUnitFields(items: readonly unknown[]): string[] {
  const fields = new Set<string>();
  const add = (refs: Reference[]) => refs.forEach((r) => r.ns === "unit" && fields.add(r.path[0]));
  let snippets: Record<string, string> | undefined;
  const text = (source: unknown) => typeof source === "string" && add(allTemplateReferences(expandSnippets(source, snippets).source));
  const script = (source: unknown) => typeof source === "string" && add(extractReferences(source).references);

  for (const { loop } of unitLoops(items)) {
    snippets = loop.layout?.snippets;
    text(loop.layout?.template);
    for (const meta of loop.layout?.meta ?? []) fields.add(meta.column);
    const walk = (list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const raw of list) {
        const item = raw as Partial<CodebookItem> | null;
        if (!item || typeof item !== "object") continue;
        if (item.type === "condition") {
          script(item.condition?.script);
          walk(item.children);
        } else if (item.type === "end") {
          text(item.message);
        } else if ("variable" in item && item.variable) {
          const variable = item.variable as { question?: unknown; instruction?: unknown; type?: string; fields?: unknown };
          text(variable.question);
          text(variable.instruction);
          // Span fields are names: `unit.<field>`, or a ::: text block's (whose values are counted above).
          if (variable.type === "span" && Array.isArray(variable.fields)) {
            for (const f of variable.fields) if (typeof f === "string" && f.startsWith("unit.")) fields.add(f.slice(5));
          }
        }
      }
    };
    walk(loop.children);
  }
  return [...fields];
}
