import { describe, expect, it } from "vitest";
import { widthClass } from "../../display/hooks";
import { displayEntry, unitSlide } from "./hooks";

describe("the display that is recorded", () => {
  it("waits for the width where layouts follow it: a wide screen is never recorded as narrow first", () => {
    const responsive = { layouts: "responsive", theme: "coder" } as const;
    expect(displayEntry(responsive, null, "numbers", "light")).toBeNull();
    expect(displayEntry(responsive, widthClass(1280), "numbers", "light")).toEqual({
      keys: "numbers",
      width: "wide",
      theme: "light",
    });
    expect(displayEntry(responsive, widthClass(390), "numpad", "dark")).toMatchObject({
      keys: "numpad",
      width: "narrow",
    });
  });

  it("has no width in a fixed design (nothing to wait for), no theme where the study sets it, no numpad", () => {
    expect(displayEntry({ layouts: "fixed", theme: "dark" }, null, "numpad", "dark")).toEqual({ keys: "numbers" });
    expect(displayEntry({ layouts: "fixed", theme: "coder" }, "wide", "letters", "dark")).toEqual({
      keys: "letters",
      theme: "dark",
    });
  });
});

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
