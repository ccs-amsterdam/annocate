import {
  expandSnippets,
  layoutsByItem,
  previewLayout,
  templateNames,
  type DesignItem,
  type LayoutItem,
  type TopLevelItem,
  type UnitLoopItem,
} from "@annotinder/contracts";
import { itemAtPath, itemPath, keyOf } from "../codebook/tree";

// The layout items of a loop in the editor (contracts layoutItems.ts). The
// editor holds a block's else items as a trailing child (codebook/tree.ts
// `ELSE`): the flow is followed in the loop as it is saved.

/** A loop as it is saved (else items as `elseChildren`), found by the editor's loop. */
export function savedLoop(
  items: TopLevelItem[],
  cleanItems: readonly unknown[],
  loop: UnitLoopItem,
): UnitLoopItem | undefined {
  const path = itemPath(items, keyOf(loop as DesignItem) ?? "");
  const found = path ? itemAtPath(cleanItems as TopLevelItem[], path) : null;
  return found?.type === "unit_loop" ? found : undefined;
}

/**
 * What the layouts that may apply to a loop item show ("Show field", what
 * span questions can select in): all of them together. Without a name (a
 * new item) or a layout before it: nothing.
 */
export function shownByLayouts(loop: UnitLoopItem, name: string): { shown: string[]; selectable: string[] } {
  const layouts = (layoutsByItem(loop.children).get(name) ?? []).filter((l): l is LayoutItem => l !== null);
  const shown = new Set<string>();
  const selectable = new Set<string>();
  for (const layout of layouts) {
    const names = templateNames(expandSnippets(layout.template, layout.snippets).source);
    names.shown.forEach((n) => shown.add(n));
    names.selectable.forEach((n) => selectable.add(n));
  }
  return { shown: [...shown], selectable: [...selectable] };
}

/** The layout a loop item is previewed with (contracts `previewLayout`); null: shown without the unit. */
export function layoutForPreview(loop: UnitLoopItem, name: string | undefined): LayoutItem | null {
  return name ? previewLayout(loop.children, name) : null;
}
