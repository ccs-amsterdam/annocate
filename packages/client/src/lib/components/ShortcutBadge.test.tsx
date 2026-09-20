import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShortcutBadge } from "./ShortcutBadge";
import { CoderSettingsProvider } from "../context/CoderSettingsContext";

describe("ShortcutBadge", () => {
  it("renders shortcut key badge by default", () => {
    const html = renderToStaticMarkup(
      <CoderSettingsProvider>
        <div className="relative">
          <button>Action</button>
          <ShortcutBadge shortcut="1" />
        </div>
      </CoderSettingsProvider>,
    );

    expect(html).toContain("<kbd");
    expect(html).toContain("1");
    expect(html).toContain("absolute");
  });

  it("renders with custom position class", () => {
    const html = renderToStaticMarkup(
      <CoderSettingsProvider>
        <ShortcutBadge shortcut="Del" position="right" />
      </CoderSettingsProvider>,
    );

    expect(html).toContain("Del");
    expect(html).toContain("right-1.5");
  });
});
