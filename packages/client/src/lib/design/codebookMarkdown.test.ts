import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { codebookMarkdown } from "./codebookMarkdown";

describe("codebookMarkdown", () => {
  it("writes what coders see, not how units are handed out", () => {
    const items = [
      { type: "session", urlParams: [{ name: "wave", values: [{ value: "1" }] }] },
      { type: "question", name: "age", variable: { type: "numeric", question: "How old are you?", min: 18, max: 99 } },
      {
        type: "unit_loop",
        label: "articles",
        units: { gold: { placement: "last", questions: ["topic"] } },
        children: [
          { type: "layout", template: "$unit.headline" },
          {
            type: "question",
            name: "topic",
            instruction: "The main topic.",
            variable: {
              type: "nominal",
              question: "Topic?",
              options: [{ value: "pol", label: "Politics" }, { value: "other" }],
            },
          },
        ],
      },
      { type: "end", name: "done", outcome: "complete", message: "Thanks!" },
    ] as unknown as TopLevelItem[];
    const md = codebookMarkdown(items, "Study", "First version");
    expect(md).toContain("## age: How old are you?");
    expect(md).toContain("- from 18 to 99");
    expect(md).toContain("## For each unit: articles");
    expect(md).toContain("Coders see the unit's `headline`.");
    expect(md).toContain("### topic: Topic?");
    expect(md).toContain("> The main topic.");
    expect(md).toContain("- `pol`: Politics");
    expect(md).toContain("## End: done (complete)");
    expect(md).not.toMatch(/wave|gold|balanced/);
  });

  it("describes a random condition as drawn, not asked", () => {
    const items = [
      { type: "computed", name: "framing", variable: { type: "random", draw: "random", options: [{ value: "a" }] } },
    ] as unknown as TopLevelItem[];
    expect(codebookMarkdown(items)).toContain("*Drawn at random, not asked*");
  });
});
