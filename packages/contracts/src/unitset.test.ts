import { describe, expect, it } from "vitest";
import { splitUnits } from "./unitset.js";

const ids = Array.from({ length: 23 }, (_, i) => i + 1);

describe("splitUnits", () => {
  it("sets aside overlap, then splits the rest into near-equal parts", () => {
    const { parts, overlap } = splitUnits(ids, { parts: 4, overlapUnits: 3 });
    expect(overlap).toHaveLength(3);
    expect(parts.map((p) => p.length)).toEqual([5, 5, 5, 5]);
    expect([...overlap, ...parts.flat()].sort((a, b) => a - b)).toEqual(ids);
  });

  it("supports a fractional overlap and keeps order without shuffle", () => {
    const { parts, overlap } = splitUnits(ids, { parts: 2, overlapFraction: 0.1, shuffle: false });
    expect(overlap).toEqual([1, 2]);
    expect(parts).toEqual([ids.slice(2, 13), ids.slice(13)]);
  });

  it("is deterministic for a seed", () => {
    expect(splitUnits(ids, { parts: 3, seed: 7 })).toEqual(splitUnits(ids, { parts: 3, seed: 7 }));
    expect(splitUnits(ids, { parts: 3, seed: 7 })).not.toEqual(splitUnits(ids, { parts: 3, seed: 8 }));
  });
});
