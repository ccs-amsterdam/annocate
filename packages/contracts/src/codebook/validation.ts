import type { CodebookItem, TopLevelItem } from "./item.js";

export interface CodebookValidationIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Validates tree-level semantics of a codebook document:
 *  - item names cannot be empty
 *  - item names must follow valid character set (letters, numbers, _, -, .)
 *  - item names must be unique across the entire codebook
 *  - unit_loop items must have at least one child
 *  - condition items must have at least one child
 *  - relation variables must refer to valid span variables that precede them
 */
export function validateCodebookItems(items: TopLevelItem[]): CodebookValidationIssue[] {
  const issues: CodebookValidationIssue[] = [];
  const seenNames = new Map<string, (string | number)[]>();
  const spanVariables = new Set<string>();

  function walk(
    nodes: CodebookItem[],
    currentPath: (string | number)[],
    insideUnitLoop: boolean,
  ) {
    nodes.forEach((item, index) => {
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
        (item.type === "unit_variable" || item.type === "user_variable") &&
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
        (item.type === "unit_variable" || item.type === "user_variable") &&
        item.variable?.type === "span"
      ) {
        spanVariables.add(item.name);
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
