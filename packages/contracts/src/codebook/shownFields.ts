import { unitLoops, type CodebookItem, type UnitLoopItem } from "./item.js";
import { extractReferences, type Reference } from "./references.js";
import { expandSnippets } from "./snippets.js";
import { allTemplateReferences } from "./templateBlocks.js";
import { unitsetReferences } from "./unitLoop.js";

/**
 * Every reference a unit loop makes: in its layout (with its snippets),
 * question texts, conditions and end messages, and its branches (`when`
 * and unitset names). References are always literal (validation refuses
 * `$unit[...]`), so the list is complete. Span questions' fields go to
 * `spanFields`.
 */
function loopReferences(loop: UnitLoopItem, spanFields?: (field: string) => void): Reference[] {
  const refs: Reference[] = [];
  const snippets = loop.layout?.snippets;
  const text = (source: unknown) => typeof source === "string" && refs.push(...allTemplateReferences(expandSnippets(source, snippets).source));
  const script = (source: unknown) => typeof source === "string" && refs.push(...extractReferences(source).references);

  text(loop.layout?.template);
  for (const branch of Array.isArray(loop.units) ? loop.units : []) {
    script(branch?.when?.script);
    for (const name of [branch?.mode === "sets" ? [] : [(branch as { unitset?: unknown }).unitset], branch?.overlap?.unitset].flat()) {
      if (typeof name === "string") refs.push(...unitsetReferences(name));
    }
  }
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
        if (spanFields && variable.type === "span" && Array.isArray(variable.fields)) {
          for (const f of variable.fields) if (typeof f === "string") spanFields(f);
        }
      }
    }
  };
  walk(loop.children);
  return refs;
}

/**
 * The unit fields a codebook shows or uses (docs/architecture.md §8.4): every
 * `$unit.<field>` in its unit loops, and the columns of span questions.
 * Coders are sent only these fields, and a unit version is a unit as it
 * looks with them.
 */
export function shownUnitFields(items: readonly unknown[]): string[] {
  const fields = new Set<string>();
  for (const { loop } of unitLoops(items)) {
    for (const ref of loopReferences(loop, (f) => fields.add(f))) if (ref.ns === "unit") fields.add(ref.path[0]);
  }
  return [...fields];
}

/**
 * Per unit loop (by key), the questions its units depend on: every `$var`
 * the loop refers to that isn't one of its own questions (so a coder-level
 * question). A coder's answers to them are frozen once they coded a unit in
 * the loop (docs/architecture.md §7, "Frozen answers"): changing them would change
 * what those units were coded with.
 */
export function loopDependencies(items: readonly unknown[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { key, loop } of unitLoops(items)) {
    const own = new Set<string>();
    const collect = (list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const raw of list) {
        const item = raw as Partial<CodebookItem> | null;
        if (!item || typeof item !== "object") continue;
        if (item.type === "condition") collect(item.children);
        else if ("name" in item && typeof item.name === "string") own.add(item.name);
      }
    };
    collect(loop.children);
    const names = new Set(loopReferences(loop).flatMap((r) => (r.ns === "var" && !own.has(r.path[0]) ? [r.path[0]] : [])));
    out.set(key, [...names]);
  }
  return out;
}
