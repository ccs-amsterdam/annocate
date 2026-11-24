import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// The contracts package loads under plain Node, as the server runs it: an import
// cycle between its modules can pass the tests (vitest loads modules its own
// way) and still stop the server at start ("Cannot access ... before initialization").
describe("the contracts package", () => {
  it("imports under plain Node", () => {
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `await import("@annotinder/contracts"); console.log("ok")`],
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(out.trim()).toBe("ok");
  });
});
