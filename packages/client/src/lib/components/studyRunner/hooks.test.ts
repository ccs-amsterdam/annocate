import { describe, expect, it } from "vitest";
import { widthClass } from "../../display/hooks";
import { displayEntry } from "./hooks";

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
