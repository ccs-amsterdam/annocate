import type { LayoutItem } from "./item.js";

// Which layout items apply where in a unit loop (docs/client.md §3 "Layout
// items"): a question shows the unit with the last layout item the coder
// passed, following the flow; before any, no unit. Statically, a point can
// have several candidates (layouts in blocks with a condition): `null`
// among them means "possibly none".

/** The layouts that may apply at a point: layout items, and `null` for none. */
export type LayoutCandidates = ReadonlySet<LayoutItem | null>;

interface RawNode {
  type?: unknown;
  name?: unknown;
  condition?: unknown;
  children?: unknown;
  elseChildren?: unknown;
}

/**
 * Follows a loop's items in order, calling `visit` with each item (not
 * blocks) and the layouts that may apply there; returns those after the
 * list. A block with a condition: its items or its else items (none: what
 * applied before), so after it either's result may apply.
 */
export function followLayouts(
  list: unknown,
  visit: (item: RawNode, current: LayoutCandidates) => void,
  incoming: LayoutCandidates = new Set([null]),
): LayoutCandidates {
  if (!Array.isArray(list)) return incoming;
  let current = incoming;
  for (const raw of list) {
    const item = raw as RawNode | null;
    if (!item || typeof item !== "object") continue;
    if (item.type === "block") {
      const shown = followLayouts(item.children, visit, current);
      if (!item.condition) current = shown;
      else current = new Set([...shown, ...followLayouts(item.elseChildren, visit, current)]);
      continue;
    }
    visit(item, current);
    if (item.type === "layout") current = new Set([item as LayoutItem]);
  }
  return current;
}

/** The layout items of a loop (also in blocks), in order. */
export function loopLayouts(children: unknown): LayoutItem[] {
  const found: LayoutItem[] = [];
  followLayouts(children, (item) => {
    if (item.type === "layout") found.push(item as LayoutItem);
  });
  return found;
}

/** The layouts that may apply to each named item of a loop (questions, end items). */
export function layoutsByItem(children: unknown): Map<string, (LayoutItem | null)[]> {
  const result = new Map<string, (LayoutItem | null)[]>();
  followLayouts(children, (item, current) => {
    if (typeof item.name === "string") result.set(item.name, [...current]);
  });
  return result;
}

/**
 * The layout to preview a named item with: the last layout item before it
 * (one in a block counts), else none. Where the flow may show another, the
 * coder sees that one; the preview picks one.
 */
export function previewLayout(children: unknown, name: string): LayoutItem | null {
  const candidates = layoutsByItem(children).get(name) ?? [];
  return candidates.filter((c): c is LayoutItem => c !== null).at(-1) ?? null;
}

/**
 * All the snippets of a loop's layouts together (a later layout wins a
 * shared name): what question texts, instructions and end messages in the
 * loop may use, whichever layout applies.
 */
export function loopSnippets(children: unknown): Record<string, string> {
  return Object.assign({}, ...loopLayouts(children).map((l) => l.snippets ?? {}));
}
