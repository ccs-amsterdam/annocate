import { describe, expect, it } from "vitest";
import { labelOf } from "./lenient";

describe("enum values the server may add to", () => {
  const ENDED = { complete: "Complete", screenout: "Screened out", quit: "Quit" };

  it("show their label, and a value this client doesn't know yet as it is", () => {
    expect(labelOf(ENDED, "quit")).toBe("Quit");
    expect(labelOf(ENDED, "timed_out")).toBe("timed_out");
    // Not a property every object has
    expect(labelOf(ENDED, "toString")).toBe("toString");
  });
});
