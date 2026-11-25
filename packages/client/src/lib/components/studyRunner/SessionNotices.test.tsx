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

  it("shows a link's own notice by its error code", () => {
    const html = renderToStaticMarkup(<SessionErrorScreen {...props} errorCode="link_used_up" />);
    expect(html).toContain("This link is full");
    expect(html).not.toContain("Retry");
  });

  it("tells a coder who started too many sessions to continue where they started", () => {
    const html = renderToStaticMarkup(<SessionErrorScreen {...props} errorCode="coder_session_limit" />);
    expect(html).toContain("You can&#x27;t start another session");
    expect(html).toContain("continue there");
    expect(html).not.toContain("Retry");
  });

  it("offers a coder who started on another device to log in, besides starting again", () => {
    const html = renderToStaticMarkup(<SessionErrorScreen {...props} errorCode="coder_has_session" />);
    expect(html).toContain("You already started on another device");
    expect(html).toContain("log in here too");
    expect(html).toMatch(/<button[^>]*>Log in<\/button>/);
  });

  it("treats a code that is a property of every object as any unknown code", () => {
    for (const errorCode of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const html = renderToStaticMarkup(<SessionErrorScreen {...props} errorCode={errorCode} />);
      expect(html).toContain("The answers were refused");
      expect(html).toContain("Retry");
    }
  });

  it("offers to go back to a unit the server refused, next to Retry", () => {
    const html = renderToStaticMarkup(<SessionErrorScreen {...props} onBackToUnit={() => {}} />);
    expect(html).toContain("Go back to the unit");
    expect(html).toContain("Retry");
  });
});
