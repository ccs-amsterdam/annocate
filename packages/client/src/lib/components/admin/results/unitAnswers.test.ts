import { describe, expect, it } from "vitest";
import type { ResultsUnit, SpanAnswer, VariableValue } from "@annotinder/contracts";
import { questionAnswerRows } from "./unitAnswers";

const span = (id: string, offset: number, text: string): SpanAnswer => ({
  id,
  field: "text",
  value: "actor",
  slices: [{ offset, length: text.length, text }],
});

const answer = (sessionId: number, variable: string, value: Partial<VariableValue>) => ({
  sessionId,
  coder: `coder ${sessionId}`,
  variable,
  value: { done: true, skip: false, ...value },
  unitVersionId: 1,
});

const unit = (answers: ResultsUnit["answers"]): ResultsUnit => ({
  unitId: 1,
  externalId: "u1",
  versions: [{ id: 1, data: {} }],
  answers,
});

const asIs = (v: string | number) => String(v);

describe("each coder's answer to a question about a unit", () => {
  it("writes a relation by its spans' texts: the same relation with other span ids is the same answer", () => {
    const detail = unit([
      answer(1, "actors", { spans: [span("a1", 0, "Anna"), span("a2", 10, "Bob")] }),
      answer(1, "links", { relations: [{ id: "r1", fromId: "a1", toId: "a2", value: "helps" }] }),
      answer(2, "actors", { spans: [span("b7", 10, "Bob"), span("b9", 0, "Anna")] }),
      answer(2, "links", { relations: [{ id: "r5", fromId: "b9", toId: "b7", value: "helps" }] }),
    ]);
    const { rows, differ } = questionAnswerRows(detail, "links", [undefined], asIs);
    expect(rows.map((r) => r.texts)).toEqual([["helps: Anna → Bob"], ["helps: Anna → Bob"]]);
    expect(differ).toBe(false);
  });

  it("coders differ when their relations do", () => {
    const detail = unit([
      answer(1, "actors", { spans: [span("a1", 0, "Anna"), span("a2", 10, "Bob")] }),
      answer(1, "links", { relations: [{ id: "r1", fromId: "a1", toId: "a2", value: "helps" }] }),
      answer(2, "actors", { spans: [span("b1", 0, "Anna"), span("b2", 10, "Bob")] }),
      answer(2, "links", { relations: [{ id: "r1", fromId: "b2", toId: "b1", value: "helps" }] }),
    ]);
    expect(questionAnswerRows(detail, "links", [undefined], asIs).differ).toBe(true);
  });

  it("writes spans in text order, values with their labels, a skipped question as skipped", () => {
    const detail = unit([
      answer(1, "actors", { spans: [span("a2", 10, "Bob"), span("a1", 0, "Anna")] }),
      answer(1, "tone", { values: [{ value: "1" }] }),
      answer(2, "tone", { skip: true }),
    ]);
    const label = (v: string | number) => (v === "1" ? "Positive" : String(v));
    expect(questionAnswerRows(detail, "actors", [undefined], label).rows[0].texts).toEqual(["actor: Anna; actor: Bob"]);
    const tone = questionAnswerRows(detail, "tone", [undefined], label);
    expect(tone.rows.map((r) => r.texts[0])).toEqual(["Positive", "(skipped)"]);
    expect(tone.differ).toBe(true);
  });

  it("a scale: a text per item", () => {
    const value: Partial<VariableValue> = {
      values: [
        { item: "a", value: 1 },
        { item: "b", value: 5 },
      ],
    };
    const detail = unit([answer(1, "trust", value), answer(2, "trust", value)]);
    const { rows, differ } = questionAnswerRows(detail, "trust", ["a", "b"], asIs);
    expect(rows[0].texts).toEqual(["1", "5"]);
    expect(differ).toBe(false);
  });
});
