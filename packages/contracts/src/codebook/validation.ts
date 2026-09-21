import { z } from "zod";
import { TopLevelItemSchema, type CodebookItem } from "./item.js";

export interface CodebookValidationIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Validates a codebook's items array:
 * 1. Validates each top-level item against the TopLevelItemSchema
 * 2. Enforces unique names across all items in the tree
 * 3. Enforces that span variable references in relations exist in preceding items
 * 4. Enforces structural rules (unit_loop cannot be nested, etc.)
 */
export function validateCodebookItems(items: unknown[]): CodebookValidationIssue[] {
  const issues: CodebookValidationIssue[] = [];

  // 1. Zod schema validation
  for (let i = 0; i < items.length; i++) {
    const result = TopLevelItemSchema.safeParse(items[i]);
    if (!result.success) {
      for (const err of result.error.issues) {
        issues.push({
          path: [i, ...err.path.filter((p): p is string | number => typeof p !== "symbol")],
          message: err.message,
        });
      }
    }
  }

  // 2. Tree-walking semantic validation
  const seenNames = new Map<string, (string | number)[]>();
  const spanVariables = new Set<string>();

  function walk(
    itemList: unknown[],
    currentPath: (string | number)[],
    insideUnitLoop: boolean,
  ) {
    if (!Array.isArray(itemList)) return;

    itemList.forEach((rawItem, index) => {
      if (!rawItem || typeof rawItem !== "object") return;
      const item = rawItem as Partial<CodebookItem>;
      const itemPath = [...currentPath, index];

      // Check name validity and uniqueness
      if (!item.name || item.name.trim() === "") {
        issues.push({
          path: [...itemPath, "name"],
          message: "Item name cannot be empty",
        });
      } else {
        if (!/^[a-zA-Z0-9_.-]+$/.test(item.name)) {
          issues.push({
            path: [...itemPath, "name"],
            message: `Name '${item.name}' contains invalid characters (letters, numbers, _, -, . only)`,
          });
        }
        if (seenNames.has(item.name)) {
          issues.push({
            path: [...itemPath, "name"],
            message: `Duplicate name '${item.name}'`,
          });
        } else {
          seenNames.set(item.name, itemPath);
        }
      }

      // Check relation variable references
      if (
        (item.type === "question" || item.type === "unit_variable" || item.type === "user_variable") &&
        item.variable?.type === "relation"
      ) {
        const fromVar = (item.variable as { from?: { variable?: string } }).from?.variable;
        const toVar = (item.variable as { to?: { variable?: string } }).to?.variable;
        if (fromVar && !spanVariables.has(fromVar)) {
          issues.push({
            path: [...itemPath, "variable", "from", "variable"],
            message: `Relation 'from' refers to '${fromVar}' which is not a preceding span variable`,
          });
        }
        if (toVar && !spanVariables.has(toVar)) {
          issues.push({
            path: [...itemPath, "variable", "to", "variable"],
            message: `Relation 'to' refers to '${toVar}' which is not a preceding span variable`,
          });
        }
      }

      // Record span variables for downstream relation checking
      if (
        (item.type === "question" || item.type === "unit_variable" || item.type === "user_variable") &&
        item.variable?.type === "span"
      ) {
        if (item.name) spanVariables.add(item.name);
      }

      // Check structural rules
      if (item.type === "unit_loop") {
        if (insideUnitLoop) {
          issues.push({
            path: [...itemPath, "type"],
            message: `unit_loop '${item.name}' cannot be nested inside another unit_loop`,
          });
        }
        if (!item.children || item.children.length === 0) {
          issues.push({
            path: [...itemPath, "children"],
            message: `unit_loop '${item.name}' must have at least one child item`,
          });
        } else {
          walk(item.children, [...itemPath, "children"], true);
        }
      } else if (item.type === "condition") {
        if (!item.children || item.children.length === 0) {
          issues.push({
            path: [...itemPath, "children"],
            message: `condition '${item.name}' must have at least one child item`,
          });
        } else {
          walk(item.children, [...itemPath, "children"], insideUnitLoop);
        }
      } else if (item.type === "question") {
        if (!insideUnitLoop && (item.variable?.type === "span" || item.variable?.type === "relation")) {
          issues.push({
            path: [...itemPath, "variable", "type"],
            message: `Question '${item.name}' with answer type '${item.variable.type}' can only be used inside a unit_loop`,
          });
        } else if (insideUnitLoop && item.variable?.type === "auto") {
          issues.push({
            path: [...itemPath, "variable", "type"],
            message: `Question '${item.name}' with answer type 'auto' can only be used outside a unit_loop`,
          });
        }
      } else if (item.type === "user_variable") {
        if (insideUnitLoop) {
          issues.push({
            path: [...itemPath, "type"],
            message: `user_variable '${item.name}' cannot be nested inside a unit_loop (use unit_variable instead)`,
          });
        }
      } else if (item.type === "unit_variable") {
        if (!insideUnitLoop) {
          issues.push({
            path: [...itemPath, "type"],
            message: `unit_variable '${item.name}' must be nested inside a unit_loop`,
          });
        }
      }
    });
  }

  walk(items, [], false);
  return issues;
}
