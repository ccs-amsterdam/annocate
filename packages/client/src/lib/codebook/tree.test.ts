import {
  collectQuestions,
  type TopLevelItem,
  type InLoopItem,
  type UserVariableItem,
  type UnitVariableItem,
  type UnitLoopItem,
  type VariableValue,
  type Condition,
} from "@annotinder/contracts";
import { describe, expect, it } from "vitest";
import { computeLoopSteps, computeTopLevelSteps, findItem, findParent, flattenTree, isInsideUnitLoop } from "./tree";

function confirm(name: string): UserVariableItem {
  return { name, type: "user_variable", variable: { type: "confirm", question: "?" } };
}

function topCondition(name: string, condition: Condition, children: TopLevelItem[]): TopLevelItem {
  return { name, type: "condition", condition, children };
}

function inLoopCondition(name: string, condition: Condition, children: InLoopItem[]): InLoopItem {
  return { name, type: "condition", condition, children };
}

function unitVar(name: string): UnitVariableItem {
  return {
    name,
    type: "unit_variable",
    variable: { type: "select_code", question: "?", codes: [{ code: "A" }, { code: "B" }] },
  };
}

function unitLoop(name: string, children: InLoopItem[], unitset = "main"): UnitLoopItem {
  return { name, type: "unit_loop", units: [{ sources: [{ unitset }] }], layout: { template: "" }, children };
}

const answered: VariableValue = { done: true, skip: false };
const code = (c: string): VariableValue => ({ done: true, skip: false, codes: [{ code: c }] });

describe("tree utilities", () => {
  const loopNode = unitLoop("main_loop", [
    unitVar("sentiment"),
    inLoopCondition("inner_gate", { rules: [{ ref: "$var.sentiment.code", op: "is", value: "A" }] }, [unitVar("followup")]),
    inLoopCondition("unit_gate", { script: "$unit.n > 1" }, [unitVar("long")]),
  ]);

  const items: TopLevelItem[] = [
    confirm("consent"),
    topCondition("gate", { rules: [{ ref: "$var.consent.answered", op: "is", value: true }] }, [confirm("gated_question")]),
    topCondition("second", { script: "$var.gated_question.answered" }, [confirm("deeper")]),
    loopNode,
  ];
  const ctx = { questions: collectQuestions(items).questions };

  it("flattenTree returns all items in document order", () => {
    expect(flattenTree(items).map((i) => i.name)).toEqual([
      "consent",
      "gate",
      "gated_question",
      "second",
      "deeper",
      "main_loop",
      "sentiment",
      "inner_gate",
      "followup",
      "unit_gate",
      "long",
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
      const { steps } = await computeTopLevelSteps(items, {}, ctx);
      expect(steps.map((i) => i.name)).toEqual(["consent", "main_loop"]);
    });

    it("includes a condition's children when true", async () => {
      const { steps } = await computeTopLevelSteps(items, { consent: answered }, ctx);
      expect(steps.map((i) => i.name)).toEqual(["consent", "gated_question", "main_loop"]);
    });

    it("treats answers of hidden questions as unanswered", async () => {
      // gated_question was answered, but consent is now skipped: gate hides it, so `second` doesn't show either
      const answers = { consent: { done: true, skip: true }, gated_question: answered };
      const { steps, visible } = await computeTopLevelSteps(items, answers, ctx);
      expect(steps.map((i) => i.name)).toEqual(["consent", "main_loop"]);
      expect(Object.keys(visible)).toEqual(["consent"]);
    });
  });

  describe("computeLoopSteps", () => {
    it("gates nested conditions within the loop using per-unit values and unit data", async () => {
      const names = async (unitAnswers: Record<string, VariableValue>, n: number) =>
        (await computeLoopSteps(loopNode, {}, unitAnswers, { n }, ctx)).steps.map((i) => i.name);
      expect(await names({ sentiment: code("A") }, 1)).toEqual(["sentiment", "followup"]);
      expect(await names({ sentiment: code("B") }, 2)).toEqual(["sentiment", "long"]);
    });
  });
});
