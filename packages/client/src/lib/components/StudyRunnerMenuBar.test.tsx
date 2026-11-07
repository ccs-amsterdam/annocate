import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudyRunner } from "./StudyRunner";

describe("StudyRunner menu bar and settings integration", () => {
  it("renders StudyRunner with CoderSettingsProvider and initial loading state", () => {
    const html = renderToStaticMarkup(
      <StudyRunner
        baseUrl="http://localhost:3000"
      />
    );
    expect(html).toContain("Loading session…");
  });
});
