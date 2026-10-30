import {
  collectQuestions,
  itemName,
  type CodebookItem,
  type TopLevelItem,
  type InLoopItem,
  type TopLevelQuestionItem,
  type InLoopQuestionItem,
  type UnitLoopItem,
  type VariableValue,
  type Condition,
} from "@annotinder/contracts";
import { describe, expect, it } from "vitest";
import { computeLoopSteps, computeTopLevelSteps, findItem, findParent, flattenTree, isInsideUnitLoop, itemAtPath, keyOf } from "./tree";

/** Items by name; conditions (which have none) by their editor key. */
const id = (item: CodebookItem) => itemName(item) ?? keyOf(item);

function confirm(name: string): TopLevelQuestionItem {
  return { name, type: "question", variable: { type: "confirm", question: "?" } };
}

function topCondition(name: string, condition: Condition, children: TopLevelItem[]): TopLevelItem {
  return { _key: name, type: "condition", condition, children } as TopLevelItem;
}

function inLoopCondition(name: string, condition: Condition, children: InLoopItem[]): InLoopItem {
  return { _key: name, type: "condition", condition, children } as InLoopItem;
}

function unitVar(name: string): InLoopQuestionItem {
  return {
    name,
    type: "question",
    variable: { type: "nominal", question: "?", options: [{ value: "A" }, { value: "B" }] },
  };
}

function unitLoop(name: string, children: InLoopItem[]): UnitLoopItem {
  return { _key: name, type: "unit_loop", units: [{ mode: "all" }], layout: { template: "" }, children } as UnitLoopItem;
}

const answered: VariableValue = { done: true, skip: false };
const code = (c: string): VariableValue => ({ done: true, skip: false, values: [{ value: c }] });

describe("tree utilities", () => {
  const loopNode = unitLoop("main_loop", [
    unitVar("sentiment"),
    inLoopCondition("inner_gate", { script: `$var.sentiment.is("A")` }, [unitVar("followup")]),
    inLoopCondition("unit_gate", { script: "$unit.n > 1" }, [unitVar("long")]),
  ]);

  const items: TopLevelItem[] = [
    confirm("consent"),
    topCondition("gate", { script: "$var.consent.answered" }, [confirm("gated_question")]),
    topCondition("second", { script: "$var.gated_question.answered" }, [confirm("deeper")]),
    loopNode,
  ];
  const ctx = { questions: collectQuestions(items).questions };

  it("flattenTree returns all items in document order", () => {
    expect(flattenTree(items).map(id)).toEqual([
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
    expect(findItem(items, "sentiment")?.type).toBe("question");
    expect(findItem(items, "unknown")).toBeNull();
  });

  it("findParent finds the parent item", () => {
    expect(id(findParent(items, "gated_question")!)).toBe("gate");
    expect(id(findParent(items, "followup")!)).toBe("inner_gate");
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
      expect(steps.map(id)).toEqual(["consent", "main_loop"]);
    });

    it("includes a condition's children when true", async () => {
      const { steps } = await computeTopLevelSteps(items, { consent: answered }, ctx);
      expect(steps.map(id)).toEqual(["consent", "gated_question", "main_loop"]);
    });

    it("treats answers of hidden questions as unanswered", async () => {
      // gated_question was answered, but consent is now skipped: gate hides it, so `second` doesn't show either
      const answers = { consent: { done: true, skip: true }, gated_question: answered };
      const { steps, visible } = await computeTopLevelSteps(items, answers, ctx);
      expect(steps.map(id)).toEqual(["consent", "main_loop"]);
      expect(Object.keys(visible)).toEqual(["consent"]);
    });
  });

  describe("computeLoopSteps", () => {
    it("gates nested conditions within the loop using per-unit values and unit data", async () => {
      const names = async (unitAnswers: Record<string, VariableValue>, n: number) =>
        (await computeLoopSteps(loopNode, {}, unitAnswers, { n }, ctx)).steps.map(id);
      expect(await names({ sentiment: code("A") }, 1)).toEqual(["sentiment", "followup"]);
      expect(await names({ sentiment: code("B") }, 2)).toEqual(["sentiment", "long"]);
    });
  });

  it("itemAtPath follows only children", () => {
    // items[3] is the loop; its first child is "sentiment".
    expect(id(itemAtPath(items, [3, "units", 0, "mode"])!)).toBe("main_loop");
    expect(id(itemAtPath(items, [3, "children", 0, "variable", "question"])!)).toBe("sentiment");
    expect(id(itemAtPath(items, [3, "children", 1, "children", 0])!)).toBe("followup");
    expect(itemAtPath(items, ["x"])).toBeNull();
  });
});
