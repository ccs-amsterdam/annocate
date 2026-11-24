import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The built package loads under plain Node, as the server runs it: an import
// cycle between modules can pass the tests (vitest loads modules its own way)
// and still stop the server at start ("Cannot access ... before initialization").
const built = fileURLToPath(new URL("../dist/index.js", import.meta.url));

describe("the built package", () => {
  it.skipIf(!existsSync(built))("imports under plain Node", () => {
    const out = execFileSync(
      process.execPath,
      ["-e", `import(${JSON.stringify(built)}).then(() => console.log("ok"))`],
      {
        encoding: "utf8",
      },
    );
    expect(out.trim()).toBe("ok");
  });
});
