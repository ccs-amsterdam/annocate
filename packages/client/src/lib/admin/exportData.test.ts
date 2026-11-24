import { describe, expect, it } from "vitest";
import type { AnnotationRow, CoderProgress, TopLevelItem } from "@annotinder/contracts";
import { Labels, answerJson, answerText } from "./exportAnswers";
import {
  annotationsTable,
  codersTable,
  resetAnswersTable,
  timingsTable,
  toCsv,
  unitsTable,
  variablesTable,
} from "./exportData";

const at = new Date("2026-11-01T10:00:00Z");
const row = (
  unitId: number,
  sessionId: number,
  variable: string,
  value: AnnotationRow["value"],
  minutes = 0,
): AnnotationRow => ({
  id: unitId * 100 + sessionId,
  unitId,
  externalId: `u${unitId}`,
  sessionId,
  coder: sessionId === 1 ? "p1" : null,
  variable,
  value,
  designVersionId: 2,
  unitVersionId: null,
  deviceId: 7,
  assigned: false,
  timing: null,
  servedAt: null,
  created: new Date(at.getTime() + minutes * 60_000),
  updated: new Date(at.getTime() + minutes * 60_000),
});
const coder = (id: number, extra: Partial<CoderProgress> = {}): CoderProgress => ({
  id,
  display: [],
  linkId: 1,
  linkLabel: "Open link",
  started: at,
  lastActive: at,
  answers: 0,
  finished: { main: 1 },
  special: {},
  variables: {},
  ended: null,
  deletionRequest: null,
  session: {},
  ...extra,
});

describe("data download", () => {
  it("writes answers as text: values joined, scale items apart, spans with their text, skipped empty", () => {
    expect(answerText({ done: true, skip: false, values: [{ value: "a" }, { value: "b" }] })).toBe("a; b");
    const scale = {
      done: true,
      skip: false,
      values: [
        { item: "tech", value: 4 },
        { item: "art", value: 2 },
      ],
    };
    expect(answerText(scale, "art")).toBe("2");
    const span = {
      done: true,
      skip: false,
      spans: [{ id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 4, text: "Lena" }] }],
    };
    expect(answerText(span)).toBe("actor: Lena");
    expect(answerText({ done: true, skip: true })).toBe("");
    // A confirm question: answered, no value
    expect(answerText({ done: true, skip: false })).toBe("true");
    // Relations name their spans by text; the JSON keeps positions and ids
    const relation = {
      done: true,
      skip: false,
      relations: [{ id: "r1", fromId: "s1", toId: "s9", value: "criticizes" }],
    };
    expect(answerText(relation, undefined, undefined, new Map([["s1", span.spans[0]]]))).toBe("criticizes: Lena → s9");
    expect(JSON.parse(answerJson(span))).toEqual([
      { id: "s1", value: "actor", field: "text", slices: [{ offset: 0, length: 4, text: "Lena" }] },
    ]);
    expect(answerJson({ done: true, skip: false, values: [{ value: "a" }, { value: "b" }] })).toBe('["a","b"]');
    expect(answerJson({ done: true, skip: true })).toBe("");
    // Numeric codes are numbers in the JSON
    expect(answerJson({ done: true, skip: false, values: [{ value: "1" }, { value: "99" }] }, true)).toBe("[1,99]");
  });

  it("makes a row per unit and coder, a column per question in design order", () => {
    const table = annotationsTable(
      [
        row(1, 1, "topic", { done: true, skip: false, values: [{ value: "politics" }] }),
        row(1, 1, "sentiment", { done: true, skip: false, values: [{ value: "pos" }] }, 2),
        row(1, 2, "sentiment", { done: true, skip: false, values: [{ value: "neg" }] }),
        row(2, 1, "interest", { done: true, skip: false, values: [{ item: "tech", value: 4 }] }),
      ],
      [coder(1), coder(2)],
      ["sentiment", "topic", "interest"],
    );
    expect(table.headers).toEqual([
      "unit_id",
      "unit_version_id",
      "session_id",
      "coder",
      "link",
      "first_answer",
      "last_change",
      "design_version",
      "device_id",
      "unit_ms_client",
      "unit_ms_server",
      "sentiment",
      "topic",
      "interest.tech",
    ]);
    expect(table.rows).toEqual([
      [
        "u1",
        "",
        "1",
        "p1",
        "Open link",
        "2026-11-01T10:00:00.000Z",
        "2026-11-01T10:02:00.000Z",
        "2",
        "7",
        "",
        "",
        "pos",
        "politics",
        "",
      ],
      [
        "u1",
        "",
        "2",
        "",
        "Open link",
        "2026-11-01T10:00:00.000Z",
        "2026-11-01T10:00:00.000Z",
        "2",
        "7",
        "",
        "",
        "neg",
        "",
        "",
      ],
      [
        "u2",
        "",
        "1",
        "p1",
        "Open link",
        "2026-11-01T10:00:00.000Z",
        "2026-11-01T10:00:00.000Z",
        "2",
        "7",
        "",
        "",
        "",
        "",
        "4",
      ],
    ]);
  });

  it("makes a row per coder with their coder-level answers and how they ended", () => {
    const table = codersTable([
      coder(1, {
        coder: "p1",
        variables: { age: { done: true, skip: false, values: [{ value: 42 }] } },
        ended: { item: "done", outcome: "complete", at },
        display: [
          { keys: "numbers", width: "narrow", at: "2026-01-01T10:00:00.000Z" },
          { keys: "numpad", width: "wide", at: "2026-01-01T10:05:00.000Z" },
          { keys: "numbers", width: "narrow", at: "2026-01-01T10:09:00.000Z" },
        ],
      }),
    ]);
    expect(table.headers).toEqual([
      "session_id",
      "coder",
      "email",
      "link",
      "started",
      "last_active",
      "ended",
      "ended_at",
      "deletion_requested",
      "display",
      "finished_loop1",
      "age",
    ]);
    expect(table.rows[0]).toEqual([
      "1",
      "p1",
      "",
      "Open link",
      at.toISOString(),
      at.toISOString(),
      "complete",
      at.toISOString(),
      "",
      "numbers, narrow; numpad, wide",
      "1",
      "42",
    ]);
  });

  it("lists every change of a coder's display, to join answers by time", async () => {
    const { displayChangesTable } = await import("./exportData");
    const table = displayChangesTable([
      coder(3, { display: [{ keys: "letters", theme: "dark", at: "2026-01-01T10:00:00.000Z" }] }),
    ]);
    expect(table).toEqual({
      headers: ["session_id", "at", "keys", "width", "theme"],
      rows: [["3", "2026-01-01T10:00:00.000Z", "letters", "", "dark"]],
    });
  });

  it("names the finished columns of unit loops by their position, in the design's order (labels can repeat)", () => {
    const table = codersTable([coder(1, { finished: { "News items": 1, "News items (2)": 2, "Unit loop 3": 3 } })]);
    expect(table.headers.filter((h) => h.startsWith("finished_"))).toEqual([
      "finished_loop1",
      "finished_loop2",
      "finished_loop3",
    ]);
    expect(table.rows[0].slice(-3)).toEqual(["1", "2", "3"]);
  });

  it("lists response times with the server's bound, and flags browsers that claim more time than the server saw", () => {
    const value = { done: true, skip: false, values: [{ value: 1 }] };
    const timing = (firstMs: number, totalMs: number) => ({ firstMs, totalMs, hiddenMs: 0, edits: 1 });
    const survey = { ...row(0, 1, "age", value, 1), unitId: null, externalId: null, timing: timing(30_000, 30_000) };
    const unit = {
      ...row(1, 1, "sentiment", value, 3),
      timing: timing(5000, 90_000),
      servedAt: new Date(at.getTime() + 2 * 60_000),
    };
    const coders = [coder(1)];
    expect(timingsTable([survey, unit], coders).rows).toEqual([
      ["", "1", "p1", "age", "30000", "30000", "0", "1", "", "60000", "false"],
      ["u1", "1", "p1", "sentiment", "5000", "90000", "0", "1", "", "60000", "true"],
    ]);
    const units = annotationsTable([survey, unit], coders, ["sentiment"]);
    expect(units.rows[0].slice(9, 11)).toEqual(["90000", "60000"]);
  });

  it("quotes CSV cells that need it, and writes the rest as it is", () => {
    expect(toCsv({ headers: ["a", "b"], rows: [['x, "y"', "z"]] })).toBe('a,b\r\n"x, ""y""",z\r\n');
    expect(toCsv({ headers: ["v"], rows: [["=HYPERLINK(1)"]] })).toBe("v\r\n=HYPERLINK(1)\r\n");
  });

  it("adds label columns, with the label in the design version each answer was given under", () => {
    const version = (label: string) =>
      [
        {
          type: "unit_loop",
          children: [
            { type: "layout", template: "" },
            {
              type: "question",
              name: "sentiment",
              variable: { type: "nominal", question: "?", options: [{ value: "pos", label }, { value: "neg" }] },
            },
          ],
        },
      ] as TopLevelItem[];
    const labels = new Labels(
      new Map([
        [1, version("Positive")],
        [2, version("Good")],
      ]),
      2,
    );
    const old = {
      ...row(1, 1, "sentiment", { done: true, skip: false, values: [{ value: "pos" }] }),
      designVersionId: 1,
    };
    const now = row(2, 1, "sentiment", { done: true, skip: false, values: [{ value: "pos" }, { value: "neg" }] });
    const table = annotationsTable([old, now], [coder(1)], [], labels);
    // Two answers to one question: also a _json column
    expect(table.headers.slice(-3)).toEqual(["sentiment", "sentiment_label", "sentiment_json"]);
    expect(table.rows.map((r) => r.slice(-3))).toEqual([
      ["pos", "Positive", '["pos"]'],
      ["pos; neg", "Good; neg", '["pos","neg"]'],
    ]);
    // One unit, answered partly under each version: each answer with its own version's labels
    const mixed = annotationsTable(
      [{ ...row(1, 1, "other", { done: true, skip: false, values: [{ value: "x" }] }, -1), designVersionId: 2 }, old],
      [coder(1)],
      [],
      labels,
    );
    expect(mixed.rows[0][mixed.headers.indexOf("sentiment_label")]).toBe("Positive");

    expect(variablesTable(new Map([[2, version("Good")]])).rows).toEqual([
      ["2", "1", "Unit loop 1", "sentiment", "nominal", "?", "pos", "Good", ""],
      ["2", "1", "Unit loop 1", "sentiment", "nominal", "?", "neg", "neg", ""],
    ]);
  });

  it("writes a special answer as its code, missing without one, with a _special column and its label", () => {
    const items = [
      {
        type: "question",
        name: "age",
        variable: {
          type: "numeric",
          question: "?",
          specials: [{ kind: "dont_know" }, { kind: "not_applicable", label: "Rather not say", value: -1 }],
        },
      },
    ] as TopLevelItem[];
    const labels = new Labels(new Map([[2, items]]), 2);
    const table = annotationsTable(
      [row(1, 1, "age", { done: true, skip: false, values: [{ special: "dont_know" }] })],
      [coder(1)],
      [],
      labels,
    );
    expect(table.headers.slice(-3)).toEqual(["age", "age_label", "age_special"]);
    expect(table.rows[0].slice(-3)).toEqual(["", "Don't know", "dont_know"]);
    expect(answerText({ done: true, skip: false, values: [{ special: "dont_know" }] })).toBe("");
    expect(answerText({ done: true, skip: false, values: [{ special: "not_applicable", value: -1 }] })).toBe("-1");
    expect(
      answerText({ done: true, skip: false, values: [{ special: "dont_know" }] }, undefined, labels.writer("age", 2)),
    ).toBe("Don't know");
    expect(
      answerText(
        { done: true, skip: false, values: [{ special: "not_applicable", value: -1 }] },
        undefined,
        labels.writer("age", 2),
      ),
    ).toBe("Rather not say");
    expect(answerJson({ done: true, skip: false, values: [{ special: "dont_know" }] })).toBe("[null]");
    expect(variablesTable(new Map([[2, items]])).rows.map((r) => r.slice(-3))).toEqual([
      ["", "Don't know", "dont_know"],
      ["-1", "Rather not say", "not_applicable"],
    ]);
  });

  it("writes comments in a _comment column, and on spans and relations in the JSON", () => {
    const table = annotationsTable(
      [row(1, 1, "topic", { done: true, skip: false, values: [{ value: "eu" }], comment: "Hard to tell" })],
      [coder(1)],
      [],
    );
    expect(table.headers.slice(-2)).toEqual(["topic", "topic_comment"]);
    expect(table.rows[0].slice(-2)).toEqual(["eu", "Hard to tell"]);
    const span = {
      done: true,
      skip: false,
      spans: [
        { id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 4, text: "Lena" }], comment: "?" },
      ],
    };
    expect(JSON.parse(answerJson(span))[0].comment).toBe("?");
  });

  it("lists reset answers apart, with when they were given and reset", () => {
    const live = row(1, 1, "sentiment", { done: true, skip: false, values: [{ value: "neg" }] });
    const reset = {
      ...row(1, 1, "sentiment", { done: true, skip: false, values: [{ value: "pos" }] }),
      retiredAt: new Date(at.getTime() + 60_000),
    };
    const table = resetAnswersTable([live, reset]);
    expect(table.headers).toEqual([
      "unit_id",
      "unit_version_id",
      "session_id",
      "coder",
      "variable",
      "value",
      "value_json",
      "design_version",
      "answered",
      "reset_at",
    ]);
    expect(table.rows).toEqual([
      [
        "u1",
        "",
        "1",
        "p1",
        "sentiment",
        "pos",
        '["pos"]',
        "2",
        at.toISOString(),
        new Date(at.getTime() + 60_000).toISOString(),
      ],
    ]);
  });

  it("lists the unit versions answers were given on", () => {
    const versions = [
      { id: 7, unitId: 1, externalId: "u1", hash: "h1", data: { text: "old" }, created: at },
      { id: 8, unitId: 1, externalId: "u1", hash: "h2", data: { text: "new" }, created: at },
      { id: 9, unitId: 2, externalId: "u2", hash: "h3", data: { text: "never coded" }, created: at },
    ];
    const answered = [
      { ...row(1, 1, "q", { done: true, skip: false }), unitVersionId: 7 },
      { ...row(1, 2, "q", { done: true, skip: false }), unitVersionId: 8 },
    ];
    expect(unitsTable(versions, answered)).toEqual({
      headers: ["unit_version_id", "unit_id", "hash", "deployed", "text"],
      rows: [
        ["7", "u1", "h1", at.toISOString(), "old"],
        ["8", "u1", "h2", at.toISOString(), "new"],
      ],
    });
  });
});
