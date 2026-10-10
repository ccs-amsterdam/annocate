import { z } from "zod";
import { TopLevelItemSchema, type CodebookItem } from "./item.js";
import { unitsetPlaceholders, type UnitBranch } from "./unitLoop.js";

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
 * 5. Enforces that unit_loop branches only refer to coder-level variables
 *    defined before the loop, and agreement rules to questions inside it
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
  /** Coder-level (outside any loop) variables seen so far -> their codes, if known. */
  const coderVariables = new Map<string, string[] | null>();

  function codesOf(variable: unknown): string[] | null {
    const v = variable as { type?: string; codes?: { code: string }[]; options?: { code: string }[] };
    if (v?.type === "auto") return v.options?.map((o) => o.code) ?? null;
    return v?.codes?.map((c) => c.code) ?? null;
  }

  function questionNames(list: unknown, into = new Set<string>()): Set<string> {
    if (!Array.isArray(list)) return into;
    for (const raw of list) {
      const child = raw as Partial<CodebookItem>;
      if (child?.type === "condition") questionNames((child as { children?: unknown }).children, into);
      else if (child?.name) into.add(child.name);
    }
    return into;
  }

  function checkLoopBranches(item: Partial<CodebookItem>, itemPath: (string | number)[]) {
    const branches = (item as { units?: UnitBranch[] }).units;
    if (!Array.isArray(branches)) return;
    const loopQuestions = questionNames((item as { children?: unknown }).children);
    branches.forEach((branch, b) => {
      for (const [variable, expected] of Object.entries(branch?.when ?? {})) {
        const path = [...itemPath, "units", b, "when", variable];
        if (!coderVariables.has(variable)) {
          issues.push({ path, message: `'${variable}' is not a coder-level variable defined before this loop` });
          continue;
        }
        const codes = coderVariables.get(variable);
        for (const value of Array.isArray(expected) ? expected : [expected]) {
          if (codes && !codes.includes(value)) issues.push({ path, message: `'${value}' is not a code of '${variable}'` });
        }
      }
      (branch?.sources ?? []).forEach((source, i) => {
        const path = [...itemPath, "units", b, "sources", i];
        for (const variable of unitsetPlaceholders(source?.unitset ?? "")) {
          if (!coderVariables.has(variable)) {
            issues.push({
              path: [...path, "unitset"],
              message: `Placeholder '{${variable}}' is not a coder-level variable defined before this loop`,
            });
          }
        }
        const agreement = source?.dynamic?.agreement?.variable;
        if (agreement && !loopQuestions.has(agreement)) {
          issues.push({
            path: [...path, "dynamic", "agreement", "variable"],
            message: `Agreement variable '${agreement}' is not a question in this loop`,
          });
        }
      });
    });
  }

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

      // Record coder-level variables for downstream unit_loop branch checking
      if (!insideUnitLoop && (item.type === "question" || item.type === "user_variable") && item.name) {
        coderVariables.set(item.name, codesOf(item.variable));
      }

      // Check structural rules
      if (item.type === "unit_loop") {
        checkLoopBranches(item, itemPath);
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
