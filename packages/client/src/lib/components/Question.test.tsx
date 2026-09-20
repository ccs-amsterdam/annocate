import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodebookItem } from "@annotinder/contracts";
import { Question } from "./Question";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";

type QuestionItem = Extract<CodebookItem, { type: "user_variable" | "unit_variable" }>;

describe("Question dispatcher", () => {
  const onAnswer = vi.fn();

  function renders(item: QuestionItem) {
    return () => renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
  }

  it("renders confirm", () => {
    const item: QuestionItem = { name: "consent", type: "user_variable", variable: { type: "confirm", question: "Consent?" } };
    expect(renders(item)).not.toThrow();
    expect(renders(item)()).toContain("Consent?");
  });

  it("renders select_code", () => {
    const item: QuestionItem = {
      name: "sentiment",
      type: "unit_variable",
      variable: { type: "select_code", question: "Sentiment?", codes: [{ code: "pos" }, { code: "neg" }] },
    };
    const html = renders(item)();
    expect(html).toContain("Sentiment?");
    expect(html).toContain("pos");
  });

  it("renders scale", () => {
    const item: QuestionItem = {
      name: "scale_q",
      type: "unit_variable",
      variable: { type: "scale", question: "Rate it", codes: [{ code: "1" }, { code: "2" }, { code: "3" }] },
    };
    expect(renders(item)).not.toThrow();
  });

  it("renders annotinder (swipe)", () => {
    const item: QuestionItem = {
      name: "swipe_q",
      type: "unit_variable",
      variable: { type: "annotinder", question: "Like it?", codes: [{ code: "like" }, { code: "dislike" }] },
    };
    expect(renders(item)).not.toThrow();
  });

  it("renders search_code", () => {
    const item: QuestionItem = {
      name: "search_q",
      type: "unit_variable",
      variable: { type: "search_code", question: "Find code", codes: [{ code: "a" }, { code: "b" }] },
    };
    expect(renders(item)).not.toThrow();
  });

  it("renders span (wrapped in SpanAnnotationProvider, as JobRunner does)", () => {
    const item: QuestionItem = {
      name: "span_q",
      type: "unit_variable",
      variable: { type: "span", question: "Select spans", column: "text", codes: [{ code: "actor" }] },
    };
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider column="text" codes={[{ code: "actor" }]}>
        <Question item={item} onAnswer={onAnswer} />
      </SpanAnnotationProvider>,
    );
    expect(html).toContain("Select spans");
  });

  it("renders relation, given prior span answers via unitVariables", () => {
    const item: QuestionItem = {
      name: "relation_q",
      type: "unit_variable",
      variable: { type: "relation", question: "How related?", codes: [{ code: "positive" }], from: { variable: "span_q" }, to: { variable: "span_q" } },
    };
    const html = renderToStaticMarkup(
      <Question
        item={item}
        onAnswer={onAnswer}
        unitVariables={{
          span_q: { done: false, skip: false, spans: [{ id: "s1", field: "text", offset: 0, length: 5, code: "actor", text: "hello" }] },
        }}
      />,
    );
    expect(html).toContain("How related?");
  });
});
