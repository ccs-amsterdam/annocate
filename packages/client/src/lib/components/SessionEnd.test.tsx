import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EndItem } from "@annotinder/contracts";
import type { SessionEnding } from "../studyManager/types";
import { webRedirect } from "./redirect";
import { SessionEnd } from "./SessionEnd";

function endingWith(redirectUrl: string | null): SessionEnding {
  return { item: { type: "end", name: "done", outcome: "complete" } as EndItem, message: null, redirectUrl };
}

describe("webRedirect", () => {
  it("keeps http and https URLs", () => {
    expect(webRedirect("https://panel.example/back?id=7")).toBe("https://panel.example/back?id=7");
    expect(webRedirect("http://panel.example/")).toBe("http://panel.example/");
  });

  it("drops every other scheme, and what is not a URL", () => {
    expect(webRedirect("javascript:alert(1)")).toBeNull();
    expect(webRedirect(" JavaScript:alert(1)")).toBeNull();
    expect(webRedirect("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(webRedirect("/relative")).toBeNull();
    expect(webRedirect("")).toBeNull();
    expect(webRedirect(null)).toBeNull();
  });
});

describe("SessionEnd", () => {
  it("links an http(s) redirect", () => {
    const html = renderToStaticMarkup(<SessionEnd ending={endingWith("https://panel.example/back")} />);
    expect(html).toContain('href="https://panel.example/back"');
    expect(html).not.toContain("You can close this window now.");
  });

  it("shows the end text without a redirect for a javascript: URL", () => {
    const html = renderToStaticMarkup(<SessionEnd ending={endingWith("javascript:alert(1)")} />);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Continue");
    expect(html).toContain("You can close this window now.");
  });
});
