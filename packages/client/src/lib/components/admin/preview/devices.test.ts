import { describe, expect, it } from "vitest";
import { INITIAL_VIEW, presetOf, withSize } from "./devices";

describe("the preview's device frame", () => {
  it("starts as a phone preset", () => {
    expect(presetOf(INITIAL_VIEW)?.label).toBe("iPhone SE (375×667)");
  });

  it("keeps a size per frame", () => {
    const wide = withSize({ ...INITIAL_VIEW, mode: "desktop" }, { width: 1280, height: 800 });
    expect(presetOf(wide)?.label).toBe("Laptop HD (1280×800)");
    expect(wide.sizes.mobile).toEqual(INITIAL_VIEW.sizes.mobile);
    expect(presetOf({ ...wide, mode: "mobile" })?.label).toBe("iPhone SE (375×667)");
  });

  it("a size that is no preset is custom", () => {
    expect(presetOf(withSize(INITIAL_VIEW, { width: 400 }))).toBeUndefined();
  });
});
