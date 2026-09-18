import type { CodebookItem } from "./item";
import { parentPosition } from "./position";

export interface CodebookValidationIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Validates the structural/nesting rules of a flat, positional codebook item
 * array (design plan §2):
 *  - positions and names must be unique
 *  - a non-root item's parent position must exist as an item in the array
 *  - user_variable / unit_variable items are leaves (nothing may be
 *    positioned beneath them)
 *  - user_variable items may not have a unit_loop ancestor
 *  - unit_variable items MUST have a unit_loop ancestor
 *  - unit_loop items may not have a unit_loop ancestor (no nested loops)
 *  - unit_loop items must have at least one child
 *  - condition items may appear anywhere and may be nested
 *
 * Returns a list of issues; empty means the item array is structurally
 * valid. Kept as a plain function (rather than baked into a zod
 * `.superRefine`) so it can also be used standalone by the codebook editor
 * UI for inline validation feedback (see design plan §5).
 */
export function validateCodebookItems(items: CodebookItem[]): CodebookValidationIssue[] {
  const issues: CodebookValidationIssue[] = [];
  const byPosition = new Map<string, CodebookItem>();
  const byIndex = new Map<string, number>();

  items.forEach((item, index) => {
    if (byPosition.has(item.position)) {
      issues.push({ path: [index, "position"], message: `Duplicate position '${item.position}'` });
    } else {
      byPosition.set(item.position, item);
      byIndex.set(item.position, index);
    }
  });

  const names = items.map((i) => i.name);
  const seenNames = new Set<string>();
  items.forEach((item, index) => {
    if (seenNames.has(item.name)) {
      issues.push({ path: [index, "name"], message: `Duplicate name '${item.name}'` });
    }
    seenNames.add(item.name);
  });
  void names;

  const childCount = new Map<string, number>();

  for (const item of items) {
    const parent = parentPosition(item.position);
    if (parent === null) continue; // root-level item, no parent to validate

    const parentItem = byPosition.get(parent);
    const index = byIndex.get(item.position)!;
    if (!parentItem) {
      issues.push({ path: [index, "position"], message: `Parent position '${parent}' does not exist` });
      continue;
    }

    childCount.set(parent, (childCount.get(parent) ?? 0) + 1);

    if (parentItem.type === "user_variable" || parentItem.type === "unit_variable") {
      issues.push({
        path: [index, "position"],
        message: `Item '${item.name}' cannot be nested under variable '${parentItem.name}' (variables are leaves)`,
      });
    }
  }

  // Determine, for each item, whether it has a unit_loop ancestor (walking up
  // through parent positions, skipping over condition items which don't
  // change loop-membership).
  function hasUnitLoopAncestor(position: string): boolean {
    let current = parentPosition(position);
    while (current !== null) {
      const parentItem = byPosition.get(current);
      if (!parentItem) return false; // already reported as a missing-parent issue above
      if (parentItem.type === "unit_loop") return true;
      current = parentPosition(current);
    }
    return false;
  }

  for (const item of items) {
    const index = byIndex.get(item.position)!;
    const insideUnitLoop = hasUnitLoopAncestor(item.position);

    if (item.type === "user_variable" && insideUnitLoop) {
      issues.push({
        path: [index, "type"],
        message: `user_variable '${item.name}' cannot be nested inside a unit_loop (use unit_variable instead)`,
      });
    }
    if (item.type === "unit_variable" && !insideUnitLoop) {
      issues.push({
        path: [index, "type"],
        message: `unit_variable '${item.name}' must be nested inside a unit_loop`,
      });
    }
    if (item.type === "unit_loop" && insideUnitLoop) {
      issues.push({
        path: [index, "type"],
        message: `unit_loop '${item.name}' cannot be nested inside another unit_loop`,
      });
    }
  }

  for (const item of items) {
    if (item.type !== "unit_loop") continue;
    const index = byIndex.get(item.position)!;
    if (!childCount.get(item.position)) {
      issues.push({ path: [index, "position"], message: `unit_loop '${item.name}' must have at least one child` });
    }
  }

  return issues;
}
