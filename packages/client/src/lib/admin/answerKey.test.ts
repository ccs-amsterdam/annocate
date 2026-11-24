import { describe, expect, it } from "vitest";
import type { UnitField, UnitResponse } from "@annotinder/contracts";
import { cellOf, changedUnits, unitsWithEdits } from "./answerKey";

const unit = (id: number, data: UnitResponse["data"]): UnitResponse => ({
  id,
  externalId: `u${id}`,
  data,
  coded: false,
});
const units = [unit(1, { text: "a", answer_tone: "1", n: 3 }), unit(2, { text: "b", answer_tone: null, n: null })];
const fields: UnitField[] = [
  { name: "text", type: "text" },
  { name: "answer_tone", type: "text" },
  { name: "n", type: "number" },
];

describe("the right answers dialog's cells", () => {
  it("a cell is what was typed, else what the unit has", () => {
    expect(cellOf(units[0], "answer_tone", {})).toBe("1");
    expect(cellOf(units[1], "answer_tone", {})).toBe("");
    expect(cellOf(units[1], "answer_tone", { 2: { answer_tone: "2|3" } })).toBe("2|3");
  });

  it("only units with a cell that differs are changed", () => {
    const edits = { 1: { answer_tone: "1" }, 2: { answer_tone: "2" } };
    expect(changedUnits(units, edits).map((u) => u.id)).toEqual([2]);
  });

  it("uploads the changed units with their cells as the columns' types", () => {
    const edits = { 1: { n: " 5 ", feedback_tone: "Look again" }, 2: { answer_tone: " 2..4 " } };
    expect(unitsWithEdits(units, edits, fields)).toEqual([
      { externalId: "u1", data: { text: "a", answer_tone: "1", n: 5, feedback_tone: "Look again" } },
      { externalId: "u2", data: { text: "b", answer_tone: "2..4", n: null } },
    ]);
    // An emptied cell is empty
    expect(unitsWithEdits(units, { 1: { answer_tone: "" } }, fields)[0].data.answer_tone).toBeNull();
  });

  it("refuses a cell that doesn't fit its column", () => {
    expect(() => unitsWithEdits(units, { 1: { n: "many" } }, fields)).toThrow('Column n holds numbers: "many"');
  });
});
