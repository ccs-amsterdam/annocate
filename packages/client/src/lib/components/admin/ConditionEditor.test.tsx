import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { availableQuestions, type TopLevelItem } from "@annotinder/contracts";
import { ConditionEditor } from "./ConditionEditor";

const items = [
  { type: "question", name: "role", variable: { type: "nominal", question: "?", options: [{ value: "student" }, { value: "expert", label: "Expert" }] } },
  { type: "condition", name: "gate", condition: { script: "true" }, children: [{ type: "question", name: "inner", variable: { type: "confirm", question: "?" } }] },
  { type: "question", name: "later", variable: { type: "confirm", question: "?" } },
] as TopLevelItem[];

describe("ConditionEditor", () => {
  const questions = availableQuestions(items, [1]);

  it("shows a simple condition as rules, with only the questions available here", () => {
    const html = renderToStaticMarkup(
      <ConditionEditor condition={{ script: `$var.role.isAny("student", "expert")` }} onChange={() => {}} questions={questions} />,
    );
    expect(html).toContain('<option value="role" selected="">role</option>');
    expect(html).toContain('<option value="isAny" selected="">is one of</option>');
    expect(html).not.toContain("inner");
    expect(html).not.toContain("later");
    // values as toggles, showing their labels
    expect(html).toContain(">Expert</button>");
    expect(html).not.toContain("<textarea");
  });

  it("edits other scripts as scripts", () => {
    const html = renderToStaticMarkup(
      <ConditionEditor condition={{ script: `$var.role.value === "x"` }} onChange={() => {}} questions={questions} />,
    );
    expect(html).toContain("<textarea");
  });

  it("shows a script editor with a reference cheat sheet in script mode", () => {
    const html = renderToStaticMarkup(
      <ConditionEditor condition={{ script: "$var.role.value === 'expert'" }} onChange={() => {}} questions={questions} loop={{ constants: ["intro"] }} />,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain("$const.intro");
    expect(html).toContain("$var.role.is(…)");
    expect(html).toContain("$unit.&lt;field&gt;");
  });
});
