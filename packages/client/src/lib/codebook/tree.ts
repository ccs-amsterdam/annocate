import type {
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  UnitLoopItem,
  ConditionItem,
} from "@annotinder/contracts";
import { evaluateCondition } from "./conditions";
import type { ExpressionCache } from "./expressionCache";

/**
 * Tree utilities over hierarchical, nested codebook items.
 */

/** Flattens all items in the tree into a single array in document order. */
export function flattenTree(items: (TopLevelItem | InLoopItem)[]): CodebookItem[] {
  const result: CodebookItem[] = [];
  for (const item of items) {
    result.push(item);
    if ("children" in item && Array.isArray(item.children)) {
      result.push(...flattenTree(item.children));
    }
  }
  return result;
}

/** Finds an item anywhere in the tree by its unique name or _key. */
export function findItem(items: (TopLevelItem | InLoopItem)[], identifier: string): CodebookItem | null {
  for (const item of items) {
    if ((item as any)._key === identifier || item.name === identifier) return item;
    if ("children" in item && Array.isArray(item.children)) {
      const found = findItem(item.children, identifier);
      if (found) return found;
    }
  }
  return null;
}

/** Finds the parent of an item by name or _key, or null if it is at the root level. */
export function findParent(
  items: (TopLevelItem | InLoopItem)[],
  identifier: string,
): (UnitLoopItem | ConditionItem) | null {
  for (const item of items) {
    if ("children" in item && Array.isArray(item.children)) {
      if (item.children.some((child) => (child as any)._key === identifier || child.name === identifier)) {
        return item as UnitLoopItem | ConditionItem;
      }
      const found = findParent(item.children, identifier);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Returns true if an item with `name` or `_key` is inside a unit_loop (either directly
 * or through one or more nested conditions).
 */
export function isInsideUnitLoop(items: TopLevelItem[], identifier: string): boolean {
  let parent = findParent(items, identifier);
  while (parent) {
    if (parent.type === "unit_loop") return true;
    parent = findParent(items, (parent as any)._key || parent.name);
  }
  return false;
}

/**
 * Evaluates whether `item` should be shown in the current run, based on its
 * enclosing `condition` ancestors.
 *
 * An item is shown iff EVERY enclosing `condition` evaluates to true.
 * If the item has no condition ancestors, it is always shown.
 */
export async function isItemActive(
  items: TopLevelItem[],
  itemName: string,
  scope: Record<string, unknown>,
  _cache?: ExpressionCache,
): Promise<boolean> {
  const current = findItem(items, itemName);
  if (!current) return false;

  let parent = findParent(items, itemName);
  while (parent) {
    if (parent.type === "condition") {
      const active = await evaluateCondition(parent.expression, scope);
      if (!active) return false;
    }
    parent = findParent(items, parent.name);
  }
  return true;
}

export async function computeTopLevelSteps(
  items: TopLevelItem[],
  values: Record<string, unknown>,
  _cache?: ExpressionCache,
): Promise<CodebookItem[]> {
  const steps: CodebookItem[] = [];
  async function collect(nodes: TopLevelItem[]) {
    for (const node of nodes) {
      if (node.type === "condition") {
        const active = await evaluateCondition(node.expression, values);
        if (active && node.children) {
          await collect(node.children as TopLevelItem[]);
        }
      } else {
        steps.push(node);
      }
    }
  }
  await collect(items);
  return steps;
}

export async function computeLoopSteps(
  loop: UnitLoopItem,
  values: Record<string, unknown>,
  _cache?: ExpressionCache,
): Promise<CodebookItem[]> {
  const steps: CodebookItem[] = [];
  async function collect(nodes: InLoopItem[]) {
    for (const node of nodes) {
      if (node.type === "condition") {
        const active = await evaluateCondition(node.expression, values);
        if (active && node.children) {
          await collect(node.children);
        }
      } else {
        steps.push(node);
      }
    }
  }
  await collect(loop.children);
  return steps;
}
