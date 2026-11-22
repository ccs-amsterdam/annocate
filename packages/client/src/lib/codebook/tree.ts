import {
  buildScope,
  itemName,
  type AnyVariableType,
  type DesignItem,
  type TopLevelItem,
  type InLoopItem,
  type UnitData,
  type UnitLoopItem,
  type ConditionItem,
  type VariableValue,
} from "@annotinder/contracts";
import { evaluateCondition } from "./conditions";
import type { ExpressionCache } from "./expressionCache";

// Helpers over the tree of design items (items with `children`: unit
// loops and show_if), shared by the coding runtime and the editor.

/** Flattens all items in the tree into a single array in document order. */
export function flattenTree(items: (TopLevelItem | InLoopItem)[]): DesignItem[] {
  const result: DesignItem[] = [];
  for (const item of items) {
    result.push(item);
    if ("children" in item && Array.isArray(item.children)) {
      result.push(...flattenTree(item.children));
    }
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
      if (item.children.some((child) => keyOf(child) === identifier || itemName(child) === identifier)) {
        return item as UnitLoopItem | ConditionItem;
      }
      const found = findParent(item.children, identifier);
      if (found) return found;
    }
  }
  return null;
}

/** The path of an item (by name or _key), as in validation issues: `[1, "children", 0]`. */
export function itemPath(items: (TopLevelItem | InLoopItem)[], identifier: string): (string | number)[] | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (keyOf(item) === identifier || itemName(item) === identifier) return [i];
    if ("children" in item && Array.isArray(item.children)) {
      const inner = itemPath(item.children, identifier);
      if (inner) return [i, "children", ...inner];
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
    if (path[i + 1] !== "children") break;
    list = (item as { children?: unknown }).children;
    i++;
  }
  return found;
}

/**
 * What a unit loop goes over, for the codebook tree: an earlier loop's
 * units or its subset, dividing, and special units not spread (the default).
 */
export function loopUnitsSummary(loop: UnitLoopItem): string {
  const spec = loop.units ?? {};
  const subset = spec.subset;
  const units = spec.sameAsPrevious
    ? "the previous loop's units"
    : subset
      ? `${subset.column} ${subset.sets.join(", ")}`
      : "the coder's units";
  const divided = spec.divide ? ", divided" : "";
  const special = (["overlap", "practice", "gold"] as const).filter((k) => spec[k] && spec[k] !== "spread");
  const own = spec.coding === false ? ", only special units" : "";
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

/** The unit loop around the item with this name or `_key` (also through conditions), if any. */
function loopAround(items: TopLevelItem[], identifier: string): UnitLoopItem | undefined {
  let parent = findParent(items, identifier);
  while (parent) {
    if (parent.type === "unit_loop") return parent as UnitLoopItem;
    parent = findParent(items, keyOf(parent) || itemName(parent) || "");
  }
  return undefined;
}

/** Whether the item with this name or `_key` is inside a unit loop (also through conditions). */
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
   * Answers of questions that are currently shown (or computed items reached).
   * Answers of questions a condition hides count as unanswered: a stale
   * answer to a hidden question never decides what comes next.
   */
  visible: Record<string, VariableValue>;
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
  steps: DesignItem[],
): Promise<boolean> {
  for (const node of nodes) {
    if (node.type === "show_if") {
      const scope = buildScope(ctx.questions, visible, unit?.data, ctx.session);
      if (await evaluateCondition(node.condition, scope, ctx.cache, `condition:${node.condition.script}`)) {
        if (await walkSteps(node.children, answers, visible, ctx, unit, steps)) return true;
      }
    } else if (node.type === "unit_loop") {
      steps.push(node);
    } else if (node.type === "end") {
      steps.push(node);
      return true;
    } else if (node.type !== "session") {
      if (answers[node.name] !== undefined) visible[node.name] = answers[node.name];
      // Computed items are never asked: computed by the server when the coder
      // reaches them (an invisible step until then, StudyManager asks for the value).
      if (node.type !== "computed" || answers[node.name] === undefined) steps.push(node);
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
  const steps: DesignItem[] = [];
  const visible: Record<string, VariableValue> = {};
  await walkSteps(items, answers, visible, ctx, null, steps);
  return { steps, visible };
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
  const steps: DesignItem[] = [];
  const visible: Record<string, VariableValue> = { ...coderAnswers };
  await walkSteps(loop.children, unitAnswers, visible, ctx, { data: unit }, steps);
  return { steps, visible };
}

/** The unit loop the item is in (through conditions), if any. */
export function enclosingLoop(items: TopLevelItem[], item: DesignItem): UnitLoopItem | undefined {
  return loopAround(items, keyOf(item) || itemName(item) || "");
}

/** The unit fields the span questions of a loop select in: shown as selectable text in its layout. */
export function spanColumns(loop: Pick<UnitLoopItem, "children">): string[] {
  return flattenTree(loop.children).flatMap((item) =>
    "variable" in item && item.variable.type === "span" ? item.variable.fields : [],
  );
}
