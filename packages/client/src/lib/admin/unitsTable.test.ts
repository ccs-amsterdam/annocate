import { describe, expect, it } from "vitest";
import { clampOffset, existingSelection, parseToCode, unitFieldText } from "./unitsTable";

describe("a unit's field as text", () => {
  it("writes a list as its labels", () => {
    expect(unitFieldText(["a", { label: "Bee", value: "b" }])).toBe("a; Bee");
  });

  it("writes other values as they are, nothing as empty", () => {
    expect(unitFieldText("text")).toBe("text");
    expect(unitFieldText(3)).toBe("3");
    expect(unitFieldText(false)).toBe("false");
    expect(unitFieldText(null)).toBe("");
    expect(unitFieldText(undefined)).toBe("");
  });
});

describe("the page of units shown", () => {
  it("is the last page when the asked one no longer exists", () => {
    expect(clampOffset(100, 100, 50)).toBe(50);
    expect(clampOffset(100, 101, 50)).toBe(100);
    expect(clampOffset(50, 0, 50)).toBe(0);
    expect(clampOffset(0, 10, 50)).toBe(0);
  });
});

describe("the selected units", () => {
  it("leave out units that were deleted", () => {
    expect([...existingSelection(new Set([1, 2, 3]), [1, 3, 4])]).toEqual([1, 3]);
  });
});

describe("the to code number", () => {
  it("is applied as typed, at most what there is", () => {
    expect(parseToCode("25", 100)).toBe(25);
    expect(parseToCode(" 250 ", 100)).toBe(100);
    expect(parseToCode("0", 100)).toBe(0);
  });

  it("an empty field (while retyping) changes nothing", () => {
    expect(parseToCode("", 100)).toBeNull();
    expect(parseToCode("abc", 100)).toBeNull();
    expect(parseToCode("-3", 100)).toBeNull();
  });
});
