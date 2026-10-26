import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { availableQuestions, type TopLevelItem } from "@annotinder/contracts";
import { ConditionEditor } from "./ConditionEditor";

const items = [
  { type: "question", name: "role", variable: { type: "select_code", question: "?", codes: [{ code: "student" }, { code: "expert" }] } },
  { type: "condition", name: "gate", condition: { rules: [] }, children: [{ type: "question", name: "inner", variable: { type: "confirm", question: "?" } }] },
  { type: "question", name: "later", variable: { type: "confirm", question: "?" } },
] as TopLevelItem[];

describe("ConditionEditor", () => {
  const questions = availableQuestions(items, [1]);

  it("offers only the references validation accepts at this point", () => {
    const html = renderToStaticMarkup(
      <ConditionEditor
        condition={{ rules: [{ ref: "$var.role.code", op: "is", value: "student" }] }}
        onChange={() => {}}
        questions={questions}
      />,
    );
    expect(html).toContain("$var.role.code");
    expect(html).toContain("$var.role.answered");
    expect(html).not.toContain("$var.inner");
    expect(html).not.toContain("$var.later");
    expect(html).not.toContain("$unit.(field)");
    // codes as toggles
    expect(html).toContain(">expert</button>");
  });

  it("shows a script editor with a reference cheat sheet in script mode", () => {
    const html = renderToStaticMarkup(
      <ConditionEditor condition={{ script: "$var.role.code === 'expert'" }} onChange={() => {}} questions={questions} loop={{ constants: ["intro"] }} />,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain("$const.intro");
    expect(html).toContain("$unit.&lt;field&gt;");
  });
});
