import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionErrorScreen } from "./SessionNotices";

const props = {
  error: "The answers were refused",
  errorCode: null,
  onRetry: () => {},
  onStartNewSession: () => {},
  baseUrl: "/api/d/1",
  onPickName: () => {},
};

describe("SessionErrorScreen", () => {
  it("offers Retry for an error without its own notice", () => {
    const html = renderToStaticMarkup(<SessionErrorScreen {...props} />);
    expect(html).toContain("The answers were refused");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Go back to the unit");
  });

  it("offers to go back to a unit the server refused, next to Retry", () => {
    const html = renderToStaticMarkup(<SessionErrorScreen {...props} onBackToUnit={() => {}} />);
    expect(html).toContain("Go back to the unit");
    expect(html).toContain("Retry");
  });
});
