import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { codebookMarkdown } from "./codebookMarkdown";

describe("codebookMarkdown", () => {
  it("writes what coders see, not how units are handed out", () => {
    const items = [
      { type: "session", params: [{ name: "wave", kind: "url", values: { list: [{ value: "1" }] } }] },
      { type: "question", name: "age", variable: { type: "numeric", question: "How old are you?", min: 18, max: 99 } },
      {
        type: "unit_loop",
        label: "articles",
        units: [{ mode: "assign", group: "g", from: { draw: "balanced" }, gold: { placement: "last", questions: ["topic"] } }],
        layout: { template: "$unit.headline" },
        children: [
          {
            type: "question",
            name: "topic",
            variable: { type: "nominal", question: "Topic?", instruction: "The main topic.", options: [{ value: "pol", label: "Politics" }, { value: "other" }] },
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
});
