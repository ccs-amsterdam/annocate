import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DockedAnswerPane } from "./DockedAnswerPane";
import { startsSwipe } from "./swipe";

/** An element inside (or not) a part marked `data-no-swipe`. */
const element = (inside: boolean) => ({
  closest: (selector: string) => (inside && selector === "[data-no-swipe]" ? {} : null),
});

describe("where a swipe starts", () => {
  it("anywhere on the surface, but not on a part with a drag of its own", () => {
    expect(startsSwipe(element(false) as unknown as EventTarget)).toBe(true);
    expect(startsSwipe(element(true) as unknown as EventTarget)).toBe(false);
    expect(startsSwipe(null)).toBe(true);
  });

  it("not on the answer pane's resize handle (dragging it up is no swipe up)", () => {
    const html = renderToStaticMarkup(<DockedAnswerPane>answers</DockedAnswerPane>);
    expect(html).toMatch(/<div data-no-swipe=""[^>]*role="separator"/);
  });
});
