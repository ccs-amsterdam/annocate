import { defineConfig } from "vitest/config";

// Vitest 5's default excludes no longer reliably keep compiled output out
// of test discovery once `tsc -b` has populated dist/ with *.test.js --
// explicitly excluding it avoids running every test twice (found while
// upgrading to vitest 5; docs/client.md §8).
export default defineConfig({
  test: {
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
