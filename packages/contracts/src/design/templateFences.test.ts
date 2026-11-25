import { describe, expect, it } from "vitest";
import { templateFences } from "./references.js";

describe("template fence lines", () => {
  it("read the keyword and its argument, without spaces and tabs around them", () => {
    const source = ":::  if $var.topic == 'politics'\t \nText\n:::\t\n";
    const fences = templateFences(source);
    expect(fences.map((f) => [f.keyword, f.arg])).toEqual([
      ["if", "$var.topic == 'politics'"],
      ["close", ""],
    ]);
    expect(source.slice(fences[0]!.argStart).startsWith("$var.topic")).toBe(true);
  });

  it("stay fast on a long run of tabs (the line is matched in one piece)", () => {
    const started = performance.now();
    templateFences(":::" + "\t".repeat(50_000) + "\r\n" + ":::" + " \t".repeat(25_000) + "x\r");
    expect(performance.now() - started).toBeLessThan(500);
  });
});
