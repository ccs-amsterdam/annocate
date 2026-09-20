import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JobRunner } from "./JobRunner";

describe("JobRunner menu bar and settings integration", () => {
  it("renders JobRunner with CoderSettingsProvider and initial loading state", () => {
    const html = renderToStaticMarkup(
      <JobRunner
        baseUrl="http://localhost:3000"
        coderKey="test-coder"
      />
    );
    expect(html).toContain("Loading session...");
  });
});
