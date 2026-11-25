import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ServerInfo } from "@annotinder/contracts";
import { ServerInfoList } from "./AboutPage";

const NOTHING_SET: ServerInfo = {
  operator: null,
  hosting: null,
  contact: null,
  privacyUrl: null,
  termsUrl: null,
  version: { release: "0.9.0", commit: "abc1234" },
};

/** The page's lines as "label: value". */
function lines(info: ServerInfo): string[] {
  const html = renderToStaticMarkup(<ServerInfoList info={info} />);
  return [...html.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map(
    ([, label, value]) => `${label}: ${value.replace(/<[^>]+>/g, "")}`,
  );
}

describe("About this server", () => {
  it("says what the operator set, with links to the statement, the terms and an email address", () => {
    const info: ServerInfo = {
      ...NOTHING_SET,
      operator: "The Example Lab",
      hosting: "A university data centre in Exampletown",
      contact: "annotinder@example.org",
      privacyUrl: "https://example.org/privacy",
      termsUrl: "https://example.org/terms",
    };
    expect(lines(info)).toEqual([
      "Run by: The Example Lab",
      "Hosted: A university data centre in Exampletown",
      "Contact: annotinder@example.org",
      "Privacy statement: https://example.org/privacy",
      "Terms of use: https://example.org/terms",
      "Version: AnnoTinder 0.9.0 (commit abc1234)",
    ]);
    const html = renderToStaticMarkup(<ServerInfoList info={info} />);
    expect(html).toContain('href="mailto:annotinder@example.org"');
    expect(html).toContain('href="https://example.org/privacy"');
    expect(html).toContain('href="https://example.org/terms"');
  });

  it("says so where the operator set nothing; the version is always there", () => {
    expect(lines(NOTHING_SET)).toEqual([
      "Run by: Not stated",
      "Hosted: Not stated",
      "Contact: Not stated",
      "Privacy statement: Not stated",
      "Terms of use: Not stated",
      "Version: AnnoTinder 0.9.0 (commit abc1234)",
    ]);
  });

  it("shows a contact that is not an email address as written", () => {
    const html = renderToStaticMarkup(
      <ServerInfoList info={{ ...NOTHING_SET, contact: "Room 1.23, ask for the lab" }} />,
    );
    expect(html).toContain("Room 1.23, ask for the lab");
    expect(html).not.toContain("mailto:");
  });
});
