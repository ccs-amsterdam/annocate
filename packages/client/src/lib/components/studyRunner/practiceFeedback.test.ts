import { describe, expect, it } from "vitest";
import type { CoderUnitResponse } from "@annotinder/contracts";
import { practiceFeedback } from "./practiceFeedback";

const wrong = { unitId: 7, question: "stance", messages: [], retry: true };
const unit = (id: number) => ({ id }) as CoderUnitResponse;

describe("practice feedback", () => {
  it("shows with the question of the unit that was answered wrongly", () => {
    expect(practiceFeedback({ practiceWrong: wrong, currentUnit: unit(7) }, "stance")).toBe(wrong);
  });

  it("doesn't show with another question of that unit", () => {
    expect(practiceFeedback({ practiceWrong: wrong, currentUnit: unit(7) }, "topic")).toBeNull();
  });

  it("doesn't show with the same question of another unit, or without a unit", () => {
    expect(practiceFeedback({ practiceWrong: wrong, currentUnit: unit(8) }, "stance")).toBeNull();
    expect(practiceFeedback({ practiceWrong: wrong, currentUnit: null }, "stance")).toBeNull();
  });

  it("is none without a wrong answer", () => {
    expect(practiceFeedback({ practiceWrong: null, currentUnit: unit(7) }, "stance")).toBeNull();
  });
});
