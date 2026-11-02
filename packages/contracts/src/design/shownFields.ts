import { unitLoops, type DesignItem, type UnitLoopItem } from "./item.js";
import { goldColumn, practiceColumn, practiceMessageColumn } from "./unitLoop.js";
import { extractReferences, type Reference } from "./references.js";
import { expandSnippets } from "./snippets.js";
import { allTemplateReferences } from "./templateBlocks.js";

/**
 * Every reference a unit loop makes: in its layout (with its snippets),
 * question texts, conditions and end messages, and its branches' `when`. References are always literal (validation refuses
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
  }
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const item = raw as Partial<DesignItem> | null;
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
        const item = raw as Partial<DesignItem> | null;
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

/**
 * How a codebook uses each unit field (docs/plans/design.md §3):
 * - `shown`: in a layout, a question or instruction text, an end message,
 *   or selected in by a span question: coders see it;
 * - `sent`: only in conditions the browser evaluates: sent to coders, not
 *   shown (anyone looking behind the scenes can see it);
 * - `server`: answer columns of gold and practice questions: never sent.
 * Fields not in the map aren't used.
 */
export type FieldUse = "shown" | "sent" | "server";

export function fieldUsage(items: readonly unknown[]): Map<string, FieldUse> {
  const usage = new Map<string, FieldUse>();
  const rank: Record<FieldUse, number> = { shown: 3, sent: 2, server: 1 };
  const use = (field: string, how: FieldUse) => {
    const now = usage.get(field);
    if (!now || rank[how] > rank[now]) usage.set(field, how);
  };
  for (const { loop } of unitLoops(items)) {
    // A field referred to more often than in the loop's scripts is in a text coders see
    const counts = new Map<string, number>();
    for (const ref of loopReferences(loop, (f) => use(f, "shown"))) if (ref.ns === "unit") counts.set(ref.path[0], (counts.get(ref.path[0]) ?? 0) + 1);
    for (const [field, n] of counts) use(field, n > scriptCount(loop, field) ? "shown" : "sent");
    for (const branch of Array.isArray(loop.units) ? loop.units : []) {
      if (branch.mode === "all") continue;
      for (const q of branch.gold?.questions ?? []) use(goldColumn(q), "server");
      for (const q of branch.practice?.questions ?? []) {
        use(practiceColumn(q), "server");
        use(practiceMessageColumn(q), "server");
      }
    }
  }
  return usage;
}

/** How often a loop's scripts (branch and condition) refer to `$unit.<field>`. */
function scriptCount(loop: UnitLoopItem, field: string): number {
  let n = 0;
  const count = (script: unknown) => {
    for (const ref of extractReferences(String(script ?? "")).references) if (ref.ns === "unit" && ref.path[0] === field) n++;
  };
  for (const branch of Array.isArray(loop.units) ? loop.units : []) count(branch?.when?.script);
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const item = raw as Partial<DesignItem> | null;
      if (item?.type !== "condition") continue;
      count(item.condition?.script);
      walk(item.children);
    }
  };
  walk(loop.children);
  return n;
}

/**
 * Unit fields the codebook uses but the design doesn't declare (`$unit.id`
 * and `_` names, which AnnoTinder provides, aside).
 */
export function undeclaredFields(items: readonly unknown[], declared: readonly { name: string }[]): string[] {
  const names = new Set(declared.map((f) => f.name));
  return [...fieldUsage(items).keys()].filter((f) => !names.has(f) && f !== "id" && !f.startsWith("_"));
}
