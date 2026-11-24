import { describe, expect, it } from "vitest";
import { applySnippet } from "./markdownSnippet";

describe("markdown snippets in a text area", () => {
  it("wrap the selection, the cursor at $0", () => {
    expect(applySnippet("a word here", 2, 6, "**${TM_SELECTED_TEXT}$0**", false)).toEqual({
      text: "a **word** here",
      cursor: 8,
    });
  });

  it("start a line for a heading or list item", () => {
    expect(applySnippet("Intro", 5, 5, "- ${TM_SELECTED_TEXT}$0", true)).toEqual({ text: "Intro\n- ", cursor: 8 });
    expect(applySnippet("", 0, 0, "## ${TM_SELECTED_TEXT}$0", true)).toEqual({ text: "## ", cursor: 3 });
  });
});
