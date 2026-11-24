import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UnsavedNotice, WaitingForConnection } from "./ConnectionNotices";

describe("while saving waits for the connection", () => {
  it("the top bar says how many finished units wait", () => {
    expect(renderToStaticMarkup(<UnsavedNotice unsavedUnits={1} />)).toContain("1 unit not saved yet: no connection");
    expect(renderToStaticMarkup(<UnsavedNotice unsavedUnits={3} />)).toContain("3 units not saved yet: no connection");
  });

  it("the top bar names no number when only other answers wait", () => {
    const html = renderToStaticMarkup(<UnsavedNotice unsavedUnits={0} />);
    expect(html).toContain("Not saved yet: no connection");
    expect(html).not.toContain("0 units");
  });

  it("the coding screen says it waits for the connection", () => {
    expect(renderToStaticMarkup(<WaitingForConnection />)).toContain("Waiting for the connection…");
  });
});
