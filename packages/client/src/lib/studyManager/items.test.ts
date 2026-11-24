import { describe, expect, it } from "vitest";
import type { AnyVariableType, CoderUnitLoopItem, TopLevelItem, VariableValue } from "@annotinder/contracts";
import { currentAnswers, findEnd, loopVariables } from "./items";

const confirm = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });

describe("codebook lookups", () => {
  it("find end items and loop questions in a branch's else items too", () => {
    const items = [
      {
        type: "branch",
        condition: { script: "true" },
        children: [{ type: "end", name: "done", outcome: "complete" }],
        elseChildren: [{ type: "end", name: "out", outcome: "screenout" }],
      },
    ] as TopLevelItem[];
    expect(findEnd(items, "done")?.outcome).toBe("complete");
    expect(findEnd(items, "out")?.outcome).toBe("screenout");
    expect(findEnd(items, "nope")).toBeNull();

    const loop = {
      type: "unit_loop",
      id: "loop_1",
      children: [
        confirm("a"),
        { type: "branch", condition: { script: "true" }, children: [confirm("b")], elseChildren: [confirm("c")] },
      ],
    } as unknown as CoderUnitLoopItem;
    expect([...loopVariables(loop).keys()]).toEqual(["a", "b", "c"]);
  });
});

describe("the answers that still fit (currentAnswers)", () => {
  const variables = new Map(
    Object.entries({
      people: { type: "span", question: "?", fields: ["text"], options: [{ value: "person" }] },
      links: {
        type: "relation",
        question: "?",
        options: [{ value: "knows" }],
        rules: [{ from: { variable: "people" }, to: { variable: "people" } }],
      },
      main: { type: "nominal", question: "?", options: [], optionsFrom: { from: "$var.people" } },
      about: { type: "nominal", question: "?", options: [], optionsFrom: { from: "$var.main_spans" } },
      main_spans: { type: "span", question: "?", fields: ["text"], options: [{ value: "person" }, { value: "x" }] },
    }) as [string, AnyVariableType][],
  );
  const span = (id: string, value = "person") => ({
    id,
    field: "text",
    value,
    slices: [{ offset: 0, length: 3, text: "Ann" }],
  });
  const answers = (values: Record<string, object>) => values as Record<string, VariableValue>;
  const relation = (fromId: string, toId: string) => ({
    done: true,
    relations: [{ id: "r", fromId, toId, value: "knows" }],
  });

  it("keep a relation between spans that are there, and an option that is a span", () => {
    const given = answers({
      people: { done: true, spans: [span("s1"), span("s2")] },
      links: relation("s1", "s2"),
      main: { done: true, values: [{ value: "s2" }] },
    });
    expect(currentAnswers(given, variables)).toEqual(given);
  });

  it("leave out a relation to a span that isn't there, and an option that was that span", () => {
    const given = answers({
      people: { done: true, spans: [span("s1")] },
      links: relation("s1", "s2"),
      main: { done: true, values: [{ value: "s2" }] },
    });
    expect(Object.keys(currentAnswers(given, variables))).toEqual(["people"]);
  });

  it("keep a skipped relation, whatever the spans", () => {
    const given = answers({ links: { done: true, skip: true } });
    expect(currentAnswers(given, variables)).toEqual(given);
  });

  it("leave out what builds on an answer that is itself left out", () => {
    const given = answers({
      // A span value the question doesn't have: the answer doesn't fit
      main_spans: { done: true, spans: [span("s9", "gone")] },
      about: { done: true, values: [{ value: "s9" }] },
    });
    expect(currentAnswers(given, variables)).toEqual({});
  });
});
