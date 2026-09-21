import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodebookItem } from "@annotinder/contracts";
import { Question } from "./Question";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";

type QuestionItem = Extract<CodebookItem, { type: "user_variable" | "unit_variable" }>;

describe("Question dispatcher", () => {
  const onAnswer = vi.fn();

  it("renders confirm", () => {
    const item: QuestionItem = {
      name: "confirm_q",
      type: "user_variable",
      variable: { type: "confirm", question: "Do you agree?" },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("Do you agree?");
    expect(html).toContain("I confirm");
  });

  it("renders select_code", () => {
    const item: QuestionItem = {
      name: "code_q",
      type: "unit_variable",
      variable: {
        type: "select_code",
        question: "Pick a code",
        codes: [{ code: "pos", value: 1 }, { code: "neg", value: 2 }],
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("Pick a code");
    expect(html).toContain("pos");
    expect(html).toContain("neg");
  });

  it("renders scale", () => {
    const item: QuestionItem = {
      name: "scale_q",
      type: "unit_variable",
      variable: {
        type: "scale",
        question: "Rate sentiment",
        codes: [{ code: "low", value: 1 }, { code: "high", value: 5 }],
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("Rate sentiment");
    expect(html).toContain("low");
    expect(html).toContain("high");
  });

  it("renders annotinder (swipe)", () => {
    const item: QuestionItem = {
      name: "swipe_q",
      type: "unit_variable",
      variable: {
        type: "annotinder",
        question: "Relevant?",
        codes: [{ code: "yes", value: 1 }, { code: "no", value: 0 }],
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("Relevant?");
    expect(html).toContain("yes");
    expect(html).toContain("no");
  });

  it("renders search_code", () => {
    const item: QuestionItem = {
      name: "search_q",
      type: "unit_variable",
      variable: {
        type: "search_code",
        question: "Search topic",
        codes: [{ code: "economy" }, { code: "sports" }],
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("Search topic");
    expect(html).toContain("Search and choose a code");
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
    expect(html).toContain("Click or select words above to label spans.");
    expect(html).toContain("0 labeled");
    expect(html).toContain("Done (0)");
  });

  it("hides question text when viewing all labeled spans", () => {
    const item: QuestionItem = {
      name: "span_q",
      type: "unit_variable",
      variable: { type: "span", question: "Select spans", column: "text", codes: [{ code: "actor" }] },
    };
    const initialSpans = [
      { id: "s1", field: "text", code: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        codes={[{ code: "actor" }]}
        initialSpans={initialSpans}
        initialIsViewingAllLabels={true}
      >
        <Question item={item} onAnswer={onAnswer} />
      </SpanAnnotationProvider>,
    );
    // Question text should be hidden to keep docked card compact
    expect(html).not.toContain("Select spans");
    // Labeled spans list is shown
    expect(html).toContain("All labeled spans (1):");
  });

  it("renders normal span answer form with a button to view labeled spans instead of full list by default", () => {
    const item: QuestionItem = {
      name: "span_q",
      type: "unit_variable",
      variable: { type: "span", question: "Select spans", column: "text", codes: [{ code: "actor" }] },
    };
    const initialSpans = [
      { id: "s1", field: "text", code: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider column="text" codes={[{ code: "actor" }]} initialSpans={initialSpans}>
        <Question item={item} onAnswer={onAnswer} />
      </SpanAnnotationProvider>,
    );
    // Button to open list in place of answer form is present
    expect(html).toContain("View labeled spans (1)");
    expect(html).toContain("1 labeled");
    // Should NOT show full inline list by default
    expect(html).not.toContain("Remove span");
  });

  it("renders span in single-label manage mode when clicking an existing word showing menu first", () => {
    const item: QuestionItem = {
      name: "span_q",
      type: "unit_variable",
      variable: {
        type: "span",
        question: "Select spans",
        column: "text",
        codes: [{ code: "actor" }, { code: "issue" }],
      },
    };
    const initialSpans = [
      { id: "s1", field: "text", code: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const initialPendingSpan = {
      slices: [{ offset: 0, length: 5, text: "hello" }],
      existingSpanIds: ["s1"],
      mode: "manage" as const,
    };

    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        codes={[{ code: "actor" }, { code: "issue" }]}
        initialSpans={initialSpans}
        initialPendingSpan={initialPendingSpan}
      >
        <Question item={item} onAnswer={onAnswer} />
      </SpanAnnotationProvider>,
    );
    // When clicking a word with existing label (even single label), shows menu first
    expect(html).toContain("Current labels (1):");
    expect(html).toContain("actor");
    expect(html).toContain("Create new label");
  });

  it("renders SpanEditLabel when a specific targetSpanId is selected", () => {
    const item: QuestionItem = {
      name: "span_q",
      type: "unit_variable",
      variable: {
        type: "span",
        question: "Select spans",
        column: "text",
        codes: [{ code: "actor" }, { code: "issue" }],
      },
    };
    const initialSpans = [
      { id: "s1", field: "text", code: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const initialPendingSpan = {
      slices: [{ offset: 0, length: 5, text: "hello" }],
      existingSpanIds: ["s1"],
      targetSpanId: "s1",
      mode: "manage" as const,
    };

    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        codes={[{ code: "actor" }, { code: "issue" }]}
        initialSpans={initialSpans}
        initialPendingSpan={initialPendingSpan}
      >
        <Question item={item} onAnswer={onAnswer} />
      </SpanAnnotationProvider>,
    );
    // Shows Delete button and code buttons to change, and NO 'new label' button in SpanEditLabel
    expect(html).toContain("Delete");
    expect(html).toContain("actor");
    expect(html).toContain("issue");
    expect(html).toContain("hello");
    expect(html).not.toContain("New label");
  });

  it("renders span in multi-label manage mode showing menu to choose label to edit", () => {
    const item: QuestionItem = {
      name: "span_q",
      type: "unit_variable",
      variable: {
        type: "span",
        question: "Select spans",
        column: "text",
        codes: [{ code: "actor" }, { code: "issue" }],
      },
    };
    const initialSpans = [
      { id: "s1", field: "text", code: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
      { id: "s2", field: "text", code: "issue", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const initialPendingSpan = {
      slices: [{ offset: 0, length: 5, text: "hello" }],
      existingSpanIds: ["s1", "s2"],
      mode: "manage" as const,
    };

    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        codes={[{ code: "actor" }, { code: "issue" }]}
        initialSpans={initialSpans}
        initialPendingSpan={initialPendingSpan}
      >
        <Question item={item} onAnswer={onAnswer} />
      </SpanAnnotationProvider>,
    );
    expect(html).toContain("Current labels (2):");
    expect(html).toContain("actor");
    expect(html).toContain("issue");
    expect(html).toContain("Create new label");
  });

  it("renders span in create mode showing selected span text and code choice buttons", () => {
    const item: QuestionItem = {
      name: "span_q",
      type: "unit_variable",
      variable: {
        type: "span",
        question: "Select spans",
        column: "text",
        codes: [{ code: "actor" }, { code: "issue" }],
      },
    };
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        codes={[{ code: "actor" }, { code: "issue" }]}
        initialPendingSpan={{ slices: [{ offset: 0, length: 5, text: "hello" }], mode: "create" }}
      >
        <Question item={item} onAnswer={onAnswer} />
      </SpanAnnotationProvider>,
    );
    expect(html).toContain("hello");
    expect(html).toContain("actor");
    expect(html).toContain("issue");
  });

  it("renders relation, given prior span answers via unitVariables", () => {
    const item: QuestionItem = {
      name: "rel_q",
      type: "unit_variable",
      variable: {
        type: "relation",
        question: "Link actors to issues",
        from: { variable: "spans_var" },
        to: { variable: "spans_var" },
        codes: [{ code: "supports" }, { code: "opposes" }],
      },
    };
    const unitVariables = {
      spans_var: {
        done: true,
        skip: false,
        spans: [
          { id: "s1", field: "text", code: "actor", slices: [{ offset: 0, length: 4, text: "John" }] },
          { id: "s2", field: "text", code: "issue", slices: [{ offset: 10, length: 7, text: "Climate" }] },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <Question item={item} onAnswer={onAnswer} unitVariables={unitVariables} />,
    );
    expect(html).toContain("Link actors to issues");
    expect(html).toContain("John");
    expect(html).toContain("Climate");
    expect(html).toContain("supports");
    expect(html).toContain("opposes");
  });
});
