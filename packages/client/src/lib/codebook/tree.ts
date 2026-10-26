import {
  buildScope,
  type AnyVariableType,
  type CodebookItem,
  type TopLevelItem,
  type InLoopItem,
  type UnitData,
  type UnitLoopItem,
  type ConditionItem,
  type VariableValue,
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

/** The path of an item (by name or _key), as in validation issues: `[1, "children", 0]`. */
export function itemPath(items: (TopLevelItem | InLoopItem)[], identifier: string): (string | number)[] | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if ((item as { _key?: string })._key === identifier || item.name === identifier) return [i];
    if ("children" in item && Array.isArray(item.children)) {
      const inner = itemPath(item.children, identifier);
      if (inner) return [i, "children", ...inner];
    }
  }
  return null;
}

/** The item a validation issue's path points into (following its numeric segments), if any. */
export function itemAtPath(items: (TopLevelItem | InLoopItem)[], path: (string | number)[]): CodebookItem | null {
  let current: unknown = items;
  let found: CodebookItem | null = null;
  for (const segment of path) {
    if (typeof segment !== "number") continue;
    if (Array.isArray(current)) current = current[segment];
    else if (current && typeof current === "object" && "children" in current && Array.isArray(current.children)) {
      current = current.children[segment];
    } else break;
    if (current && typeof current === "object" && "type" in current) found = current as CodebookItem;
  }
  return found;
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

export interface StepContext {
  /** Every question in the codebook (contracts `collectQuestions`), so the scope has all of them. */
  questions: ReadonlyMap<string, AnyVariableType>;
  cache?: ExpressionCache;
}

export interface Steps {
  /** The items to show, in order. */
  steps: CodebookItem[];
  /**
   * Answers of questions that are currently shown (or assigned, for `auto`).
   * Answers of questions a condition hides count as unanswered: a stale
   * answer to a hidden question never decides what comes next.
   */
  visible: Record<string, VariableValue>;
}

/**
 * Walks items in document order. Each condition is evaluated against the
 * answers of the questions before it that are visible (validation ensures a
 * condition only refers to earlier questions), so one pass suffices.
 */
async function walkSteps(
  nodes: (TopLevelItem | InLoopItem)[],
  answers: Record<string, VariableValue>,
  visible: Record<string, VariableValue>,
  ctx: StepContext,
  unit: { data: UnitData; constants?: Record<string, string> } | null,
  steps: CodebookItem[],
): Promise<void> {
  for (const node of nodes) {
    if (node.type === "condition") {
      const scope = buildScope(ctx.questions, visible, unit?.data, unit?.constants);
      if (await evaluateCondition(node.condition, scope, ctx.cache, `condition:${node.name}`)) {
        await walkSteps(node.children, answers, visible, ctx, unit, steps);
      }
    } else if (node.type === "unit_loop") {
      steps.push(node);
    } else {
      if (answers[node.name] !== undefined) visible[node.name] = answers[node.name];
      // `auto` questions are assigned (by the server or from the URL), never asked.
      if (node.variable.type !== "auto") steps.push(node);
    }
  }
}

/** Top-level steps (questions and unit loops; loops aren't entered) given the coder's answers. */
export async function computeTopLevelSteps(
  items: TopLevelItem[],
  answers: Record<string, VariableValue>,
  ctx: StepContext,
): Promise<Steps> {
  const steps: CodebookItem[] = [];
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
  loop: UnitLoopItem,
  coderAnswers: Record<string, VariableValue>,
  unitAnswers: Record<string, VariableValue>,
  unit: UnitData,
  ctx: StepContext,
): Promise<Steps> {
  const steps: CodebookItem[] = [];
  const visible: Record<string, VariableValue> = { ...coderAnswers };
  await walkSteps(loop.children, unitAnswers, visible, ctx, { data: unit, constants: loop.layout.constants }, steps);
  return { steps, visible };
}
