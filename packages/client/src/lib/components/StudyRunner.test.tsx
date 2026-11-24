import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudyRunner } from "./StudyRunner";

describe("StudyRunner", () => {
  it("shows the loading screen until the session is there", () => {
    const html = renderToStaticMarkup(<StudyRunner baseUrl="http://localhost:3000" />);
    expect(html).toContain("Loading session…");
  });
});
