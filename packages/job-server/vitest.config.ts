import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    // Vitest 5's default excludes no longer reliably keep compiled output
    // out of test discovery once `tsc -b` has populated dist/ with
    // *.test.js -- explicitly excluding it avoids running every test twice
    // (design plan §6.5, found while upgrading to vitest 5).
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
