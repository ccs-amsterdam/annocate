import { describe, expect, it } from "vitest";
import { isHeadingQuestion } from "./questionHeading";

describe("question headings", () => {
  it("are short single paragraphs, inline formatting allowed", () => {
    expect(isHeadingQuestion("What is the topic?")).toBe(true);
    expect(isHeadingQuestion("Is **$unit.name** mentioned?")).toBe(true);
    expect(isHeadingQuestion("A question\nwrapped over two lines?")).toBe(true);
  });

  it("aren't markdown with blocks, several paragraphs or long texts", () => {
    expect(isHeadingQuestion("## Topic\n\nWhat is it about?")).toBe(false);
    expect(isHeadingQuestion("Read this.\n\nThen answer.")).toBe(false);
    expect(isHeadingQuestion("Which?\n- a\n- b")).toBe(false);
    expect(isHeadingQuestion("> A quote")).toBe(false);
    expect(isHeadingQuestion("x".repeat(151))).toBe(false);
  });
});
