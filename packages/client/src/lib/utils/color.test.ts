import { describe, expect, it } from "vitest";
import { valueColor } from "./color";
import { optionColor } from "../components/spanText";

describe("code colours", () => {
  it("a code without a colour gets one from its value: the same each time, different for other values", () => {
    expect(valueColor("person")).toMatch(/^#[0-9a-f]{6}$/);
    expect(valueColor("person")).toBe(valueColor("person"));
    expect(new Set(["person", "organisation", "place", "event"].map(valueColor)).size).toBe(4);
    // An option's own colour comes first
    expect(optionColor([{ value: "person", color: "#123456" }], "person")).toBe("#123456");
    expect(optionColor([{ value: "person" }], "person")).toBe(valueColor("person"));
  });
});
