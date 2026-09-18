import { comparePositions, parentPosition, type CodebookItem } from "@annotinder/contracts";
import { evaluateCondition } from "./conditions";
import type { ExpressionCache } from "./expressionCache";

/**
 * Position-based tree utilities over a flat, positional codebook item array
 * (design plan §2/§5). This -- together with `@annotinder/contracts`'
 * `validateCodebookItems` -- is the client's sole source of truth for
 * codebook shape; there is no server-side tree logic to keep in sync with.
 */

export function sortByPosition<T extends CodebookItem>(items: T[]): T[] {
  return [...items].sort((a, b) => comparePositions(a.position, b.position));
}

/** Root-level items (depth 1), in position order. */
export function getRootItems(items: CodebookItem[]): CodebookItem[] {
  return sortByPosition(items.filter((item) => parentPosition(item.position) === null));
}

/** Direct children of `position`, in position order. */
export function getChildren(items: CodebookItem[], position: string): CodebookItem[] {
  return sortByPosition(items.filter((item) => parentPosition(item.position) === position));
}

/** All descendants (direct and transitive) of `position`, in position order. */
export function getDescendants(items: CodebookItem[], position: string): CodebookItem[] {
  const prefix = `${position}.`;
  return sortByPosition(items.filter((item) => item.position.startsWith(prefix)));
}

/** Ancestors of `position`, ordered root-first (nearest ancestor last). Does not include the item itself. */
export function getAncestors(items: CodebookItem[], position: string): CodebookItem[] {
  const byPosition = new Map(items.map((item) => [item.position, item]));
  const ancestors: CodebookItem[] = [];
  let current = parentPosition(position);
  while (current !== null) {
    const item = byPosition.get(current);
    if (item) ancestors.unshift(item);
    current = parentPosition(current);
  }
  return ancestors;
}

/**
 * Evaluates a `condition` item's expression, using the (optional) shared
 * `ExpressionCache` (design plan §12) when supplied -- memoizing per
 * condition item (keyed by its stable `position`) -- and falling back to a
 * fresh, uncached `evaluateCondition` call otherwise (e.g. in tests that
 * don't care about memoization).
 */
async function evaluateConditionCached(
  node: Extract<CodebookItem, { type: "condition" }>,
  values: Record<string, unknown>,
  cache?: ExpressionCache,
): Promise<boolean> {
  if (!cache) return evaluateCondition(node.expression, values);
  return Boolean(await cache.evaluate(`condition:${node.position}`, node.expression, values));
}

/** Item internally treated as a "step" is either a leaf variable or an unentered unit_loop. */

async function collectSteps(
  items: CodebookItem[],
  nodes: CodebookItem[],
  values: Record<string, unknown>,
  opts: { descendIntoLoops: boolean; cache?: ExpressionCache },
): Promise<CodebookItem[]> {
  const steps: CodebookItem[] = [];
  for (const node of sortByPosition(nodes)) {
    if (node.type === "condition") {
      if (await evaluateConditionCached(node, values, opts.cache)) {
        steps.push(...(await collectSteps(items, getChildren(items, node.position), values, opts)));
      }
      continue;
    }
    if (node.type === "unit_loop") {
      steps.push(node);
      if (opts.descendIntoLoops) {
        steps.push(...(await collectSteps(items, getChildren(items, node.position), values, opts)));
      }
      continue;
    }
    steps.push(node);
  }
  return steps;
}

/**
 * The document-order sequence of "top-level steps": user_variable leaves and
 * unit_loop items (in gated/condition-evaluated order), NOT descending into
 * a unit_loop's own children -- those are handled per-unit via
 * `computeLoopSteps` while that loop is active (design plan §5's JobManager).
 *
 * `cache` (design plan §12, optional): when supplied, memoizes each
 * `condition` item's evaluation per-position, reusing the cached result
 * whenever the condition expression's actually-referenced values haven't
 * changed since the last call, instead of always re-running QuickJS.
 */
export function computeTopLevelSteps(
  items: CodebookItem[],
  values: Record<string, unknown>,
  cache?: ExpressionCache,
): Promise<CodebookItem[]> {
  return collectSteps(items, getRootItems(items), values, { descendIntoLoops: false, cache });
}

/** The gated sequence of unit_variable leaves within one active unit_loop, for the current unit's values. */
export function computeLoopSteps(
  items: CodebookItem[],
  loopPosition: string,
  values: Record<string, unknown>,
  cache?: ExpressionCache,
): Promise<CodebookItem[]> {
  return collectSteps(items, getChildren(items, loopPosition), values, { descendIntoLoops: true, cache });
}
