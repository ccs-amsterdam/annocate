import { describe, expect, it } from "vitest";
import type { CodebookItem } from "./item";
import { validateCodebookItems } from "./validation";

const confirmVariable = { type: "confirm" as const, question: "Confirm?" };

function userVar(position: string, name: string): CodebookItem {
  return { type: "user_variable", position, name, variable: confirmVariable };
}
function unitVar(position: string, name: string): CodebookItem {
  return { type: "unit_variable", position, name, variable: confirmVariable };
}
function unitLoop(position: string, name: string, unitset = "main"): CodebookItem {
  return { type: "unit_loop", position, name, unitset, layout: { fields: [] } };
}
function condition(position: string, name: string, expression = "true"): CodebookItem {
  return { type: "condition", position, name, expression };
}

describe("validateCodebookItems", () => {
  it("accepts a minimal valid codebook", () => {
    const items = [unitLoop("1", "loop"), unitVar("1.1", "q1")];
    expect(validateCodebookItems(items)).toEqual([]);
  });

  it("allows user_variable and condition items outside a unit_loop", () => {
    const items = [
      userVar("1", "consent"),
      condition("2", "gate"),
      userVar("2.1", "followup"),
      unitLoop("3", "loop"),
      unitVar("3.1", "q1"),
    ];
    expect(validateCodebookItems(items)).toEqual([]);
  });

  it("allows condition items nested inside a unit_loop, wrapping unit_variable", () => {
    const items = [unitLoop("1", "loop"), condition("1.1", "gate"), unitVar("1.1.1", "q1")];
    expect(validateCodebookItems(items)).toEqual([]);
  });

  it("rejects duplicate positions", () => {
    const items = [userVar("1", "a"), userVar("1", "b")];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("Duplicate position"))).toBe(true);
  });

  it("rejects duplicate names", () => {
    const items = [userVar("1", "a"), userVar("2", "a")];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("Duplicate name"))).toBe(true);
  });

  it("rejects an item whose parent position does not exist", () => {
    const items = [userVar("1.1", "orphan")];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("does not exist"))).toBe(true);
  });

  it("rejects nesting under a variable (variables are leaves)", () => {
    const items = [userVar("1", "a"), userVar("1.1", "b")];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("are leaves"))).toBe(true);
  });

  it("rejects user_variable nested inside a unit_loop", () => {
    const items = [unitLoop("1", "loop"), userVar("1.1", "bad")];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("cannot be nested inside a unit_loop"))).toBe(true);
  });

  it("rejects unit_variable outside a unit_loop", () => {
    const items = [unitVar("1", "bad")];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("must be nested inside a unit_loop"))).toBe(true);
  });

  it("rejects a unit_loop nested inside another unit_loop", () => {
    const items = [unitLoop("1", "outer"), unitLoop("1.1", "inner")];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("cannot be nested inside another unit_loop"))).toBe(true);
  });

  it("rejects a unit_loop with no children", () => {
    const items = [unitLoop("1", "loop"), userVar("2", "unrelated")];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("must have at least one child"))).toBe(true);
  });
});
