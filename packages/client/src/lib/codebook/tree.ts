import {
  buildScope,
  itemLists,
  itemName,
  type AnyVariableType,
  type DesignItem,
  type TopLevelItem,
  type InLoopItem,
  type UnitData,
  type UnitLoopItem,
  type BranchItem,
  type LayoutItem,
  type VariableValue,
} from "@annotinder/contracts";
import { evaluateCondition } from "./conditions";
import type { ExpressionCache } from "./expressionCache";

// Helpers over the tree of design items (items with `children`: unit
// loops and branches, which may have `elseChildren`), shared by the coding
// runtime and the editor. The editor holds a branch's else items as a
// stand-in container after the branch's own items (`ELSE`, itemEdit.ts
// `ensureKeys`); paths stay as saved (`elseChildren`).

/** The type of the editor's stand-in for a branch's else items. */
export const ELSE = "else";

/** Whether an item is the editor's stand-in for a branch's else items. */
export const isElse = (item: unknown): boolean => (item as { type?: unknown } | null)?.type === ELSE;

/** An item's own list (loops, branches, the else stand-in; in the editor with the stand-in last), else null. */
export function childrenOf(item: unknown): (TopLevelItem | InLoopItem)[] | null {
  const children = (item as { children?: unknown } | null)?.children;
  return Array.isArray(children) ? (children as (TopLevelItem | InLoopItem)[]) : null;
}

/** The items inside a branch (its items and else items) or the editor's else stand-in; null for other items. */
export function branchInner(item: DesignItem): DesignItem[] | null {
  if (item.type !== "branch" && !isElse(item)) return null;
  return itemLists(item).flatMap((l) => l.list);
}

/** Flattens all items in the tree into a single array in document order. */
export function flattenTree(items: (TopLevelItem | InLoopItem)[]): DesignItem[] {
  const result: DesignItem[] = [];
  for (const item of items) {
    result.push(item);
    for (const { list } of itemLists(item)) result.push(...flattenTree(list));
  }
  return result;
}

/** The design editor's key of an item (stable while its name is edited), if it has one. */
export function keyOf(item: DesignItem | TopLevelItem | InLoopItem): string | undefined {
  return (item as { _key?: string })._key;
}

/** Finds an item anywhere in the tree by its unique name or _key. */
export function findItem(items: (TopLevelItem | InLoopItem)[], identifier: string): DesignItem | null {
  for (const item of items) {
    if (keyOf(item) === identifier || itemName(item) === identifier) return item;
    for (const { list } of itemLists(item)) {
      const found = findItem(list, identifier);
      if (found) return found;
    }
  }
  return null;
}

/** Finds the parent of an item by name or _key, or null if it is at the root level. */
export function findParent(
  items: (TopLevelItem | InLoopItem)[],
  identifier: string,
): (UnitLoopItem | BranchItem) | null {
  for (const item of items) {
    for (const { list } of itemLists(item)) {
      if (list.some((child) => keyOf(child) === identifier || itemName(child) === identifier)) {
        return item as UnitLoopItem | BranchItem;
      }
      const found = findParent(list, identifier);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The path of an item (by name or _key), as in validation issues (on the
 * saved items): `[1, "children", 0]`, a branch's else item `[1, "elseChildren", 0]`.
 */
export function itemPath(items: (TopLevelItem | InLoopItem)[], identifier: string): (string | number)[] | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (keyOf(item) === identifier || itemName(item) === identifier) return [i];
    for (const { key, list } of itemLists(item)) {
      // The editor's else stand-in: its items are the branch's elseChildren
      const stand = list.find(isElse) as { children: (TopLevelItem | InLoopItem)[] } | undefined;
      const inner = itemPath(
        list.filter((c) => !isElse(c)),
        identifier,
      );
      if (inner) return [i, key, ...inner];
      const inElse = stand ? itemPath(stand.children, identifier) : null;
      if (inElse) return [i, "elseChildren", ...inElse];
    }
  }
  return null;
}

/**
 * The item a validation issue's path points into, if any: the path starts
 * with an item index, and goes deeper only through `children` (so
 * `[1, "units", 0, ...]` is about item 1 itself, not its first child).
 */
export function itemAtPath(items: (TopLevelItem | InLoopItem)[], path: (string | number)[]): DesignItem | null {
  let list: unknown = items;
  let found: DesignItem | null = null;
  for (let i = 0; i < path.length; i++) {
    const index = path[i];
    if (typeof index !== "number" || !Array.isArray(list)) break;
    const item = list[index] as unknown;
    if (!item || typeof item !== "object" || !("type" in item)) break;
    found = item as DesignItem;
    const next = path[i + 1];
    if (next !== "children" && next !== "elseChildren") break;
    const children = (item as { children?: unknown[] }).children ?? [];
    const own = children.filter((c) => !isElse(c));
    // Saved items have elseChildren; the editor's, an else stand-in among the children
    list =
      next === "children"
        ? own
        : ((item as { elseChildren?: unknown }).elseChildren ??
          (children.find(isElse) as { children?: unknown } | undefined)?.children);
    i++;
  }
  return found;
}

/**
 * What a unit loop goes over, for the codebook tree: an earlier loop's
 * units or its part, dividing, and test units not spread (the default).
 */
export function loopUnitsSummary(loop: UnitLoopItem): string {
  const spec = loop.units ?? {};
  const units = spec.sameAsPrevious
    ? "the previous loop's units"
    : spec.part !== undefined
      ? `part ${spec.part}`
      : "the coder's units";
  const divided = spec.divide ? ", divided" : "";
  const special = (["overlap", "practice", "gold"] as const).filter((k) => spec[k] && spec[k] !== "spread");
  const own = spec.coding === false ? ", only test units" : "";
  return `${units}${divided}${own}${special.map((k) => `, ${k} ${spec[k] === "ignore" ? "left out" : spec[k]}`).join("")}`;
}

/**
 * Whether a validation issue is about an item of `items`: its path points
 * into the item, or (without a path to an item) its message names it.
 */
export function issueIsAbout(
  items: (TopLevelItem | InLoopItem)[],
  issue: { path: (string | number)[]; message: string },
  item: DesignItem,
): boolean {
  const at = itemAtPath(items, issue.path);
  if (at) return at === item || (keyOf(at) !== undefined && keyOf(at) === keyOf(item));
  const name = itemName(item);
  return Boolean(name) && issue.message.includes(`'${name}'`);
}

/** The unit loop around the item with this name or `_key` (also through branches), if any. */
function loopAround(items: TopLevelItem[], identifier: string): UnitLoopItem | undefined {
  let parent = findParent(items, identifier);
  while (parent) {
    if (parent.type === "unit_loop") return parent as UnitLoopItem;
    parent = findParent(items, keyOf(parent) || itemName(parent) || "");
  }
  return undefined;
}

/** Whether the item with this name or `_key` is inside a unit loop (also through branches). */
export function isInsideUnitLoop(items: TopLevelItem[], identifier: string): boolean {
  return loopAround(items, identifier) !== undefined;
}

export interface StepContext {
  /** Every question in the codebook (contracts `collectQuestions`), so the scope has all of them. */
  questions: ReadonlyMap<string, AnyVariableType>;
  cache?: ExpressionCache;
  /** The session's `$session` values. */
  session?: Record<string, string>;
}

export interface Steps {
  /** The items to show, in order. */
  steps: DesignItem[];
  /**
   * Answers of questions that are currently shown (or experiments reached).
   * Answers of questions a condition hides count as unanswered: a stale
   * answer to a hidden question never decides what comes next.
   */
  visible: Record<string, VariableValue>;
  /** In a unit loop: the layout each step shows the unit with (the last layout item passed; null: none). */
  layouts: (LayoutItem | null)[];
}

/**
 * Walks items in document order. Each condition is evaluated against the
 * answers of the questions before it that are visible (validation ensures a
 * condition only refers to earlier questions), so one pass suffices. An
 * `end` item that is reached is the last step: returns true there.
 */
async function walkSteps(
  nodes: (TopLevelItem | InLoopItem)[],
  answers: Record<string, VariableValue>,
  visible: Record<string, VariableValue>,
  ctx: StepContext,
  unit: { data: UnitData } | null,
  out: Steps,
  layout: { current: LayoutItem | null },
): Promise<boolean> {
  const steps = {
    push: (item: DesignItem) => {
      out.steps.push(item);
      out.layouts.push(layout.current);
    },
  };
  for (const node of nodes) {
    if (node.type === "branch") {
      const scope = buildScope(ctx.questions, visible, unit?.data, ctx.session);
      // Its items if the condition holds, else its else items
      const holds = await evaluateCondition(node.condition, scope, ctx.cache, `condition:${node.condition.script}`);
      const shown = holds ? node.children : (node.elseChildren ?? []);
      if (await walkSteps(shown as typeof nodes, answers, visible, ctx, unit, out, layout)) return true;
    } else if (node.type === "layout") {
      // How the unit is shown from here on (not a step)
      layout.current = node;
    } else if (node.type === "unit_loop") {
      // A loop with a condition: only if it holds (on coder-level answers)
      const scope = buildScope(ctx.questions, visible, undefined, ctx.session);
      if (await evaluateCondition(node.condition, scope, ctx.cache, `loop:${node.condition?.script}`)) steps.push(node);
    } else if (node.type === "end") {
      steps.push(node);
      return true;
    } else if (node.type !== "session") {
      if (answers[node.name] !== undefined) visible[node.name] = answers[node.name];
      // Experiments are never asked: drawn by the server when the coder
      // reaches them (an invisible step until then, StudyManager asks for the value).
      if (node.type !== "experiment" || answers[node.name] === undefined) steps.push(node);
    }
  }
  return false;
}

/** Top-level steps (questions and unit loops; loops aren't entered) given the coder's answers. */
export async function computeTopLevelSteps(
  items: TopLevelItem[],
  answers: Record<string, VariableValue>,
  ctx: StepContext,
): Promise<Steps> {
  const out: Steps = { steps: [], visible: {}, layouts: [] };
  await walkSteps(items, answers, out.visible, ctx, null, out, { current: null });
  return out;
}

/**
 * The questions of a loop for one unit. `coderAnswers` are the visible
 * coder-level answers (`computeTopLevelSteps(...).visible`); the result's
 * `visible` holds those plus the unit's visible answers.
 */
export async function computeLoopSteps(
  loop: Pick<UnitLoopItem, "children">,
  coderAnswers: Record<string, VariableValue>,
  unitAnswers: Record<string, VariableValue>,
  unit: UnitData,
  ctx: StepContext,
): Promise<Steps> {
  const out: Steps = { steps: [], visible: { ...coderAnswers }, layouts: [] };
  await walkSteps(loop.children, unitAnswers, out.visible, ctx, { data: unit }, out, { current: null });
  return out;
}

/** The unit loop the item is in (through branches), if any. */
export function enclosingLoop(items: TopLevelItem[], item: DesignItem): UnitLoopItem | undefined {
  return loopAround(items, keyOf(item) || itemName(item) || "");
}

/** The unit fields the span questions of a loop select in: shown as selectable text in its layout. */
export function spanColumns(loop: Pick<UnitLoopItem, "children">): string[] {
  return flattenTree(loop.children).flatMap((item) =>
    "variable" in item && item.variable.type === "span" ? item.variable.fields : [],
  );
}
