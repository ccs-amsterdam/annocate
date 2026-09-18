import { describe, expect, it } from "vitest";
import { comparePositions, isDirectChild, parentPosition, parsePosition, positionDepth } from "./position.js";

describe("parsePosition", () => {
  it("parses dot-separated segments into numbers", () => {
    expect(parsePosition("4.2.1")).toEqual([4, 2, 1]);
    expect(parsePosition("7")).toEqual([7]);
  });
});

describe("parentPosition", () => {
  it("returns null for root-level (depth 1) positions", () => {
    expect(parentPosition("4")).toBeNull();
  });

  it("strips the last segment for nested positions", () => {
    expect(parentPosition("4.2.1")).toBe("4.2");
    expect(parentPosition("4.2")).toBe("4");
  });
});

describe("positionDepth", () => {
  it("counts dot-separated segments", () => {
    expect(positionDepth("4")).toBe(1);
    expect(positionDepth("4.2.1")).toBe(3);
  });
});

describe("isDirectChild", () => {
  it("is true only for an immediate parent/child relationship", () => {
    expect(isDirectChild("4.2", "4")).toBe(true);
    expect(isDirectChild("4.2.1", "4")).toBe(false);
    expect(isDirectChild("4.2.1", "4.2")).toBe(true);
  });
});

describe("comparePositions", () => {
  it("orders numerically, not lexicographically", () => {
    expect(comparePositions("2", "10")).toBeLessThan(0);
    expect(["10", "2", "1"].sort(comparePositions)).toEqual(["1", "2", "10"]);
  });

  it("orders a shorter prefix before its own children", () => {
    expect(comparePositions("4", "4.1")).toBeLessThan(0);
  });
});
