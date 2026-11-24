import { describe, expect, it } from "vitest";
import { unitSlide } from "./useUnitSlide";

describe("a unit's slide", () => {
  it("is kept while the unit stays (its content mounts once), whichever way the coder moves between questions", () => {
    const shown = { unitId: 7, slideClass: "" };
    expect(unitSlide(shown, 7, "previous")).toBe(shown);
    expect(unitSlide(shown, 7, "next")).toBe(shown);
  });

  it("a new unit comes in from the side the coder moved to", () => {
    const shown = { unitId: 7, slideClass: "" };
    expect(unitSlide(shown, 8, "next")).toEqual({ unitId: 8, slideClass: "animate-slide-in-right" });
    expect(unitSlide(shown, 6, "previous")).toEqual({ unitId: 6, slideClass: "animate-slide-in-left" });
  });
});
