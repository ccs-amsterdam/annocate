import { describe, expect, it } from "vitest";
import { indexOfMarker, markerOf, moveTo, recordPlace, startTrail } from "./browserHistory";

describe("recordPlace", () => {
  it("adds an entry for a new place", () => {
    expect(recordPlace(startTrail("a"), "b")).toEqual({ keys: ["a", "b"], index: 1 });
  });

  it("adds nothing for the place the entry already stands for", () => {
    expect(recordPlace({ keys: ["a", "b"], index: 0 }, "a")).toBeNull();
  });

  it("drops the entries ahead when the coder goes elsewhere", () => {
    expect(recordPlace({ keys: ["a", "b", "c"], index: 0 }, "x")).toEqual({ keys: ["a", "x"], index: 1 });
  });
});

describe("moveTo", () => {
  const trail = { keys: ["a", "b", "c"], index: 2 };

  it("counts the steps back and forward", () => {
    expect(moveTo(trail, 1)).toEqual({ trail: { keys: trail.keys, index: 1 }, steps: -1 });
    expect(moveTo(trail, 0)?.steps).toBe(-2);
    expect(moveTo({ ...trail, index: 0 }, 1)?.steps).toBe(1);
  });

  it("ignores entries that are not of this trail", () => {
    expect(moveTo(trail, null)).toBeNull();
    expect(moveTo(trail, 3)).toBeNull();
  });
});

describe("marker", () => {
  it("is read back from a history state", () => {
    expect(indexOfMarker({ other: 1, ...markerOf(2) })).toBe(2);
    expect(indexOfMarker(null)).toBeNull();
    expect(indexOfMarker({})).toBeNull();
  });
});
