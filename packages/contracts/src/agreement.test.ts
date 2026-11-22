import { describe, expect, it } from "vitest";
import { coderAgreement, cohensKappa, krippendorffAlpha, percentAgreement, type Coding } from "./agreement.js";

/**
 * The reliability data of Krippendorff (2011), "Computing Krippendorff's
 * Alpha-Reliability", p. 3: four coders, twelve units, some missing. Its
 * published results: nominal 0.743, ordinal 0.815, interval 0.849.
 */
const DATA: (number | null)[][] = [
  [1, 2, 3, 3, 2, 1, 4, 1, 2, null, null, null],
  [1, 2, 3, 3, 2, 2, 4, 1, 2, 5, null, 3],
  [null, 3, 3, 3, 2, 3, 4, 2, 2, 5, 1, null],
  [1, 2, 3, 3, 2, 4, 4, 1, 2, 5, 1, null],
];
const codings: Coding[] = DATA.flatMap((row, coder) =>
  row.flatMap((value, unit) => (value === null ? [] : [{ unit, coder, value }])),
);

describe("Krippendorff's alpha", () => {
  it("gives the published results for the example data", () => {
    expect(krippendorffAlpha(codings, "nominal")).toBeCloseTo(0.743, 3);
    expect(krippendorffAlpha(codings, "ordinal")).toBeCloseTo(0.815, 3);
    expect(krippendorffAlpha(codings, "interval")).toBeCloseTo(0.849, 3);
  });

  it("is 1 for perfect agreement, null with nothing to compare or no variation", () => {
    const same = [
      { unit: 1, coder: 1, value: "a" },
      { unit: 1, coder: 2, value: "a" },
      { unit: 2, coder: 1, value: "b" },
      { unit: 2, coder: 2, value: "b" },
    ];
    expect(krippendorffAlpha(same, "nominal")).toBe(1);
    expect(krippendorffAlpha([{ unit: 1, coder: 1, value: "a" }], "nominal")).toBeNull();
    expect(krippendorffAlpha(same.slice(0, 2), "nominal")).toBeNull();
  });
});

describe("percent agreement", () => {
  it("counts agreeing pairs of coders within units", () => {
    // Unit 0: three coders (1, 1, 1): 3 pairs agree; unit 5: (1, 2, 3, 4): 6 pairs, none agree
    const two = codings.filter((c) => c.unit === 0 || c.unit === 5);
    expect(percentAgreement(two)).toBeCloseTo(3 / 9);
  });
});

describe("Cohen's kappa", () => {
  it("gives the textbook result: 20 yes-yes, 5 yes-no, 10 no-yes, 15 no-no is 0.4", () => {
    const a = new Map<number, string>();
    const b = new Map<number, string>();
    const add = (count: number, va: string, vb: string) => {
      for (let i = 0; i < count; i++) {
        a.set(a.size, va);
        b.set(b.size, vb);
      }
    };
    add(20, "yes", "yes");
    add(5, "yes", "no");
    add(10, "no", "yes");
    add(15, "no", "no");
    expect(cohensKappa(a, b)).toBeCloseTo(0.4);
  });

  it("per coder: shared units, agreement with the others and their mean kappa", () => {
    const result = coderAgreement(codings);
    const first = result.find((r) => r.coder === 0)!;
    // Coder 0 coded units 0-8, all also coded by others
    expect(first.units).toBe(9);
    expect(first.percent).toBeGreaterThan(0.7);
    expect(first.kappa).not.toBeNull();
  });
});

describe("pairAgreement", () => {
  it("every pair of coders with units in common: kappa and percent; their average is each coder's kappa", async () => {
    const { pairAgreement, coderAgreement, cohensKappa } = await import("./agreement.js");
    const codings = [
      { unit: 1, coder: 1, value: "a" },
      { unit: 1, coder: 2, value: "a" },
      { unit: 1, coder: 3, value: "b" },
      { unit: 2, coder: 1, value: "b" },
      { unit: 2, coder: 2, value: "b" },
      { unit: 3, coder: 1, value: "a" },
      { unit: 3, coder: 3, value: "a" },
      { unit: 4, coder: 4, value: "a" },
    ];
    const pairs = pairAgreement(codings);
    // Coder 4 shares nothing; 2 and 3 share unit 1
    expect(pairs.map((p) => [p.a, p.b, p.units, p.percent])).toEqual([
      [1, 2, 2, 1],
      [1, 3, 2, 0.5],
      [2, 3, 1, 0],
    ]);
    const map = (coder: number) => new Map(codings.filter((c) => c.coder === coder).map((c) => [c.unit, c.value]));
    expect(pairs[0].kappa).toBe(cohensKappa(map(1), map(2)));
    // Coder 1's kappa: the pairs' kappas, weighed by shared units
    const one = coderAgreement(codings).find((c) => c.coder === 1)!;
    const with1 = pairs.filter((p) => p.a === 1 && p.kappa !== null);
    const mean = with1.reduce((s, p) => s + p.kappa! * p.units, 0) / with1.reduce((s, p) => s + p.units, 0);
    expect(one.kappa).toBeCloseTo(mean, 10);
  });
});
