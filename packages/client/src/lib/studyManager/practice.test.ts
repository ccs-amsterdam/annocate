import { describe, expect, it } from "vitest";
import type { AnyVariableType, CoderUnitResponse, VariableValue } from "@annotinder/contracts";
import { stepLabel } from "./navigationLabels";
import { expectedAnswerText, PracticeChecks } from "./practice";

const answer = (...values: (string | number)[]) =>
  ({ done: true, values: values.map((value) => ({ value })) }) as VariableValue;

/** A practice unit that checks `topic` (right: sports) and nothing else. */
const unit = (id = 1): CoderUnitResponse =>
  ({
    id,
    externalId: `p${id}`,
    data: {},
    practice: { retry: true, questions: { topic: { key: "sports" } } },
  }) as unknown as CoderUnitResponse;

describe("checking practice answers", () => {
  it("a right answer is right, a wrong one is wrong against the key", () => {
    const checks = new PracticeChecks();
    expect(checks.check(unit(), "topic", answer("politics"))).toEqual({ right: false, key: [{ values: ["sports"] }] });
    expect(checks.check(unit(), "topic", answer("sports"))).toEqual({ right: true });
  });

  it("checks nothing on a question without a check, or a unit that is no practice unit", () => {
    const checks = new PracticeChecks();
    expect(checks.check(unit(), "tone", answer("positive"))).toBeNull();
    const plain = { id: 2, externalId: "u2", data: {} } as unknown as CoderUnitResponse;
    expect(checks.check(plain, "topic", answer("politics"))).toBeNull();
    expect(checks.isWrong(2, "topic")).toBe(false);
  });

  it("a wrong answer isn't an answer yet, until it is right or the coder goes on with it", () => {
    const checks = new PracticeChecks();
    checks.check(unit(), "topic", answer("politics"));
    expect(checks.isWrong(1, "topic")).toBe(true);
    // (Per unit: the same question of another unit is not wrong)
    expect(checks.isWrong(2, "topic")).toBe(false);
    checks.check(unit(), "topic", answer("sports"));
    expect(checks.isWrong(1, "topic")).toBe(false);

    checks.check(unit(3), "topic", answer("politics"));
    checks.solve(3, "topic");
    expect(checks.isWrong(3, "topic")).toBe(false);
  });

  it("a question answered right, or gone on from, is checked once: a later answer is not checked", () => {
    const checks = new PracticeChecks();
    checks.check(unit(), "topic", answer("sports"));
    expect(checks.check(unit(), "topic", answer("politics"))).toBeNull();
    expect(checks.isWrong(1, "topic")).toBe(false);
  });

  it("counts the tries per question until right, and gives them once (with the unit's answers)", () => {
    const checks = new PracticeChecks();
    checks.check(unit(), "topic", answer("politics"));
    checks.check(unit(), "topic", answer("economy"));
    checks.check(unit(), "topic", answer("sports"));
    checks.check(unit(), "topic", answer("sports"));
    checks.check(unit(2), "topic", answer("sports"));
    expect([...checks.takeTries(1)]).toEqual([["topic", 3]]);
    expect([...checks.takeTries(1)]).toEqual([]);
    expect([...checks.takeTries(2)]).toEqual([["topic", 1]]);
  });
});

describe("the default feedback on a wrong practice answer", () => {
  const topic = {
    type: "nominal",
    question: "What is it about?",
    options: [{ value: "sports", label: "Sports" }, { value: "politics" }],
  } as AnyVariableType;

  it("names the question by its text and the right options by their labels", () => {
    expect(expectedAnswerText("topic", topic, [{ values: ["sports"] }])).toBe(
      'The expected answer to "What is it about?" is Sports.',
    );
  });

  it("lists alternatives with or, the values of one alternative with and, a range as between", () => {
    expect(expectedAnswerText("topic", topic, [{ values: ["sports", "politics"] }, { values: ["politics"] }])).toBe(
      'The expected answer to "What is it about?" is Sports and politics or politics.',
    );
    expect(expectedAnswerText("age", { type: "numeric", question: "" } as AnyVariableType, [{ range: [18, 30] }])).toBe(
      "The expected answer to age is between 18 and 30.",
    );
  });

  it("falls back to the question's name, e.g. when the design no longer has it", () => {
    expect(expectedAnswerText("topic", undefined, [{ values: ["x"] }])).toBe("The expected answer to topic is x.");
  });
});

describe("a step's label in the navigation menu", () => {
  const question = (text: string, name = "q1") =>
    ({ type: "question", name, variable: { type: "confirm", question: text } }) as Parameters<typeof stepLabel>[0];

  it("is the first line of its question, without markdown marks", () => {
    expect(stepLabel(question("## Is this **about** `sports`?\n\nSecond paragraph"))).toBe("Is this about sports?");
    expect(stepLabel(question("- [the article](https://example.org) is _long_"))).toBe("the article is long");
  });

  it("shows values and snippets as …, and skips a block's fence", () => {
    expect(stepLabel(question("Is $unit.title about {{ $var.topic.label }}? [[note]]"))).toBe("Is … about …? …");
    expect(stepLabel(question(":::if $var.a.is(1)\nShown if\n:::"))).toBe("Shown if");
  });

  it("is the item's name when its question has no text to show", () => {
    expect(stepLabel(question("", "consent"))).toBe("consent");
    expect(stepLabel(question("**", "consent"))).toBe("consent");
    expect(stepLabel({ type: "end", name: "screened_out" } as Parameters<typeof stepLabel>[0])).toBe("screened_out");
  });

  it("is a loop's label, else Units", () => {
    const loop = (label?: string) =>
      ({ type: "unit_loop", id: "loop_1", label, children: [] }) as Parameters<typeof stepLabel>[0];
    expect(stepLabel(loop(" Headlines "))).toBe("Headlines");
    expect(stepLabel(loop())).toBe("Units");
  });
});
