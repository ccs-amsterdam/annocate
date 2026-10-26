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

  it("renders categorical questions as option buttons", () => {
    const item: QuestionItem = {
      name: "code_q",
      type: "unit_variable",
      variable: {
        type: "categorical",
        question: "Pick a code",
        options: [{ value: "pos", label: "Positive" }, { value: "neg" }],
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("Pick a code");
    expect(html).toContain("Positive");
    expect(html).toContain(">neg<");
  });

  it("renders long lists as a dropdown", () => {
    const item: QuestionItem = {
      name: "search_q",
      type: "unit_variable",
      variable: {
        type: "categorical",
        question: "Search topic",
        options: Array.from({ length: 20 }, (_, i) => ({ value: `topic_${i}` })),
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("Search topic");
    expect(html).toContain('role="combobox"');
  });

  it("renders an ordinal question in the order of its options", () => {
    const item: QuestionItem = {
      name: "ord_q",
      type: "unit_variable",
      variable: {
        type: "categorical",
        level: "ordinal",
        question: "Rate sentiment",
        options: [{ value: 1, label: "low" }, { value: 2, label: "mid" }, { value: 3, label: "high" }],
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html.indexOf("low")).toBeLessThan(html.indexOf("high"));
  });

  it("renders numeric questions by their range", () => {
    const numeric = (extra: object): QuestionItem => ({
      name: "n",
      type: "unit_variable",
      variable: { type: "numeric", question: "How many?", ...extra },
    });
    expect(renderToStaticMarkup(<Question item={numeric({ min: 0, max: 10 })} onAnswer={onAnswer} />)).toContain(">10</button>");
    expect(renderToStaticMarkup(<Question item={numeric({ min: 0, max: 100, labels: [{ value: 0, label: "cold" }] })} onAnswer={onAnswer} />)).toContain('type="range"');
    expect(renderToStaticMarkup(<Question item={numeric({})} onAnswer={onAnswer} />)).toContain('type="number"');
  });

  it("renders scale items as rows of values, showing the label only for the selected value", () => {
    const item: QuestionItem = {
      name: "interest",
      type: "user_variable",
      variable: {
        type: "scale",
        question: "How interested are you?",
        items: [{ name: "politics", label: "Politics" }, { name: "tech" }],
        options: [{ value: 1, label: "not at all" }, { value: 2, label: "somewhat" }, { value: 3, label: "very" }],
      },
    };
    const initialValue = { done: true, skip: false, values: [{ item: "politics", value: 2 }] };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} initialValue={initialValue} />);
    expect(html).toContain("Politics");
    expect(html).toContain(">tech<");
    expect(html).toContain(">somewhat</button>"); // selected: shows its label
    expect(html).toContain(">2</button>"); // the unanswered tech row: values only
    expect(html).toContain("1 / 2");
  });

  it("renders a scale as a grid", () => {
    const item: QuestionItem = {
      name: "interest",
      type: "user_variable",
      variable: {
        type: "scale",
        layout: "grid",
        question: "?",
        items: [{ name: "politics" }],
        options: [{ value: 1, label: "no" }, { value: 2, label: "yes" }],
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("<table");
    expect(html).toContain('aria-label="politics: yes"');
  });

  it("renders annotinder (swipe) in the order left, right, up", () => {
    const item: QuestionItem = {
      name: "swipe_q",
      type: "unit_variable",
      variable: {
        type: "annotinder",
        question: "Relevant?",
        options: [{ value: "no" }, { value: "yes" }],
      },
    };
    const html = renderToStaticMarkup(<Question item={item} onAnswer={onAnswer} />);
    expect(html).toContain("Relevant?");
    expect(html.indexOf("Swipe left")).toBeLessThan(html.indexOf(">no<"));
    expect(html.indexOf("Swipe right")).toBeLessThan(html.indexOf(">yes<"));
  });

  it("renders span (wrapped in SpanAnnotationProvider, as JobRunner does)", () => {
    const item: QuestionItem = {
      name: "span_q",
      type: "unit_variable",
      variable: { type: "span", question: "Select spans", column: "text", options: [{ value: "actor" }] },
    };
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider column="text" options={[{ value: "actor" }]}>
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
      variable: { type: "span", question: "Select spans", column: "text", options: [{ value: "actor" }] },
    };
    const initialSpans = [
      { id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        options={[{ value: "actor" }]}
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
      variable: { type: "span", question: "Select spans", column: "text", options: [{ value: "actor" }] },
    };
    const initialSpans = [
      { id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider column="text" options={[{ value: "actor" }]} initialSpans={initialSpans}>
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
        options: [{ value: "actor" }, { value: "issue" }],
      },
    };
    const initialSpans = [
      { id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const initialPendingSpan = {
      slices: [{ offset: 0, length: 5, text: "hello" }],
      existingSpanIds: ["s1"],
      mode: "manage" as const,
    };

    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        options={[{ value: "actor" }, { value: "issue" }]}
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
        options: [{ value: "actor" }, { value: "issue" }],
      },
    };
    const initialSpans = [
      { id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
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
        options={[{ value: "actor" }, { value: "issue" }]}
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
        options: [{ value: "actor" }, { value: "issue" }],
      },
    };
    const initialSpans = [
      { id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 5, text: "hello" }] },
      { id: "s2", field: "text", value: "issue", slices: [{ offset: 0, length: 5, text: "hello" }] },
    ];
    const initialPendingSpan = {
      slices: [{ offset: 0, length: 5, text: "hello" }],
      existingSpanIds: ["s1", "s2"],
      mode: "manage" as const,
    };

    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        options={[{ value: "actor" }, { value: "issue" }]}
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
        options: [{ value: "actor" }, { value: "issue" }],
      },
    };
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        options={[{ value: "actor" }, { value: "issue" }]}
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
        options: [{ value: "supports" }, { value: "opposes" }],
      },
    };
    const unitVariables = {
      spans_var: {
        done: true,
        skip: false,
        spans: [
          { id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 4, text: "John" }] },
          { id: "s2", field: "text", value: "issue", slices: [{ offset: 10, length: 7, text: "Climate" }] },
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
