import type { TopLevelItem, InLoopItem, UserVariableItem, UnitVariableItem, UnitLoopItem } from "@annotinder/contracts";
import { describe, expect, it } from "vitest";
import {
  computeLoopSteps,
  computeTopLevelSteps,
  findItem,
  findParent,
  flattenTree,
  isInsideUnitLoop,
} from "./tree";

function confirm(name: string): UserVariableItem {
  return { name, type: "user_variable", variable: { type: "confirm", question: "?" } };
}

function topCondition(name: string, expression: string, children: TopLevelItem[]): TopLevelItem {
  return { name, type: "condition", expression, children };
}

function inLoopCondition(name: string, expression: string, children: InLoopItem[]): InLoopItem {
  return { name, type: "condition", expression, children };
}

function unitVar(name: string): UnitVariableItem {
  return {
    name,
    type: "unit_variable",
    variable: { type: "select_code", question: "?", codes: [{ code: "A" }, { code: "B" }] },
  };
}

function unitLoop(name: string, children: InLoopItem[], unitset = "main"): UnitLoopItem {
  return { name, type: "unit_loop", unitset, layout: { template: "" }, children };
}

describe("tree utilities", () => {
  const loopNode = unitLoop("main_loop", [
    unitVar("sentiment"),
    inLoopCondition("inner_gate", "sentiment === 'A'", [unitVar("followup")]),
  ]);

  const items: TopLevelItem[] = [
    confirm("consent"),
    topCondition("gate", "consent === true", [confirm("gated_question")]),
    loopNode,
  ];

  it("flattenTree returns all items in document order", () => {
    expect(flattenTree(items).map((i) => i.name)).toEqual([
      "consent",
      "gate",
      "gated_question",
      "main_loop",
      "sentiment",
      "inner_gate",
      "followup",
    ]);
  });

  it("findItem finds items by unique name", () => {
    expect(findItem(items, "sentiment")?.type).toBe("unit_variable");
    expect(findItem(items, "unknown")).toBeNull();
  });

  it("findParent finds the parent item", () => {
    expect(findParent(items, "gated_question")?.name).toBe("gate");
    expect(findParent(items, "followup")?.name).toBe("inner_gate");
    expect(findParent(items, "consent")).toBeNull();
  });

  it("isInsideUnitLoop identifies loop membership", () => {
    expect(isInsideUnitLoop(items, "sentiment")).toBe(true);
    expect(isInsideUnitLoop(items, "followup")).toBe(true);
    expect(isInsideUnitLoop(items, "consent")).toBe(false);
    expect(isInsideUnitLoop(items, "gated_question")).toBe(false);
  });

  describe("computeTopLevelSteps", () => {
    it("excludes a condition's children when false, does not descend into unit_loop", async () => {
      const steps = await computeTopLevelSteps(items, { consent: false });
      expect(steps.map((i) => i.name)).toEqual(["consent", "main_loop"]);
    });

    it("includes a condition's children when true", async () => {
      const steps = await computeTopLevelSteps(items, { consent: true });
      expect(steps.map((i) => i.name)).toEqual(["consent", "gated_question", "main_loop"]);
    });
  });

  describe("computeLoopSteps", () => {
    it("gates nested conditions within the loop using per-unit values", async () => {
      expect((await computeLoopSteps(loopNode, { sentiment: "A" })).map((i) => i.name)).toEqual([
        "sentiment",
        "followup",
      ]);
      expect((await computeLoopSteps(loopNode, { sentiment: "B" })).map((i) => i.name)).toEqual(["sentiment"]);
    });
  });
});
