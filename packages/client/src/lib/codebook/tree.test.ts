import type { CodebookItem } from "@annotinder/contracts";
import { describe, expect, it } from "vitest";

import { computeLoopSteps, computeTopLevelSteps, getAncestors, getChildren, getDescendants, getRootItems } from "./tree";

function confirm(position: string, name: string): CodebookItem {
  return { position, name, type: "user_variable", variable: { type: "confirm", question: "?" } };
}

function condition(position: string, name: string, expression: string): CodebookItem {
  return { position, name, type: "condition", expression };
}

function unitLoop(position: string, name: string, unitset = "main"): CodebookItem {
  return { position, name, type: "unit_loop", unitset, layout: { fields: [] } };
}

function unitVar(position: string, name: string): CodebookItem {
  return {
    position,
    name,
    type: "unit_variable",
    variable: { type: "select_code", question: "?", codes: [{ code: "A" }, { code: "B" }] },
  };
}

describe("tree utilities", () => {
  const items: CodebookItem[] = [
    confirm("1", "consent"),
    condition("2", "gate", "consent == true"),
    confirm("2.1", "gated_question"),
    unitLoop("3", "main_loop"),
    unitVar("3.1", "sentiment"),
    condition("3.2", "inner_gate", "sentiment == 'A'"),
    unitVar("3.2.1", "followup"),
  ];

  it("getRootItems returns only depth-1 items, in order", () => {
    expect(getRootItems(items).map((i) => i.name)).toEqual(["consent", "gate", "main_loop"]);
  });

  it("getChildren returns direct children only", () => {
    expect(getChildren(items, "3").map((i) => i.name)).toEqual(["sentiment", "inner_gate"]);
  });

  it("getDescendants returns all nested descendants", () => {
    expect(getDescendants(items, "3").map((i) => i.name)).toEqual(["sentiment", "inner_gate", "followup"]);
  });

  it("getAncestors returns ancestors root-first, excluding self", () => {
    expect(getAncestors(items, "3.2.1").map((i) => i.name)).toEqual(["main_loop", "inner_gate"]);
    expect(getAncestors(items, "1")).toEqual([]);
  });

  describe("computeTopLevelSteps", () => {
    it("excludes a condition's children when the condition is false, does not descend into unit_loop", () => {
      const steps = computeTopLevelSteps(items, { consent: false });
      expect(steps.map((i) => i.name)).toEqual(["consent", "main_loop"]);
    });

    it("includes a condition's children when true", () => {
      const steps = computeTopLevelSteps(items, { consent: true });
      expect(steps.map((i) => i.name)).toEqual(["consent", "gated_question", "main_loop"]);
    });
  });

  describe("computeLoopSteps", () => {
    it("gates nested conditions within the loop using per-unit values", () => {
      expect(computeLoopSteps(items, "3", { sentiment: "A" }).map((i) => i.name)).toEqual(["sentiment", "followup"]);
      expect(computeLoopSteps(items, "3", { sentiment: "B" }).map((i) => i.name)).toEqual(["sentiment"]);
    });
  });
});
