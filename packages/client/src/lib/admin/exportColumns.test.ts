import { describe, expect, it } from "vitest";
import {
  ANNOTATION_COLUMNS,
  CODER_COLUMNS,
  validateDesignItems,
  type AnnotationRow,
  type CoderProgress,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";
import { Labels } from "./exportAnswers";
import { annotationsTable, codersTable } from "./exportData";

// The download's column names can't collide: a question can't be named like
// a column of the download, and a question's extra columns have a dot.

const at = new Date("2026-11-01T10:00:00Z");
const answer = (value: string, extra: Partial<VariableValue> = {}): VariableValue => ({
  done: true,
  skip: false,
  values: [{ value }],
  ...extra,
});
const row = (variable: string, value: VariableValue, unitId: number | null = 1): AnnotationRow => ({
  id: 1,
  unitId,
  externalId: unitId === null ? null : `u${unitId}`,
  sessionId: 1,
  coder: "p1",
  variable,
  value,
  designVersionId: 1,
  unitVersionId: null,
  deviceId: 7,
  assigned: false,
  timing: null,
  servedAt: null,
  created: at,
  updated: at,
});
const coder = (variables: Record<string, VariableValue> = {}): CoderProgress => ({
  id: 1,
  display: [],
  linkId: 1,
  linkLabel: "Open link",
  started: at,
  lastActive: at,
  answers: 0,
  finished: [{ loop: "loop_1", title: "main", units: 1 }],
  testUnits: { gold: { done: 1, total: 2 } },
  variables,
  ended: null,
  deletionRequest: null,
  session: {},
});
const pick = (name: string) => ({
  type: "question",
  name,
  variable: { type: "nominal", question: "?", options: [{ value: "x", label: "X" }, { value: "y" }] },
});
const design = (inLoop: object[], outside: object[] = []) =>
  [
    { type: "session", invite: { mode: "crowd" } },
    ...outside,
    { type: "unit_loop", id: "loop_1", children: [{ type: "layout", template: "" }, ...inLoop] },
  ] as TopLevelItem[];
const errors = (items: TopLevelItem[]) =>
  validateDesignItems(items)
    .filter((i) => !i.warning)
    .map((i) => i.message);
const unique = (headers: string[]) => new Set(headers.map((h) => h.toLowerCase())).size === headers.length;

describe("the download's column names", () => {
  it("a question named like a column of the download is refused by the design", () => {
    const refused = (name: string) =>
      `'${name}' is a column of the data download (as are session_id, coder, link, started, …): choose another name`;
    for (const name of [...ANNOTATION_COLUMNS, ...CODER_COLUMNS, "gold_finished", "finished_loop_1", "Coder"]) {
      expect(errors(design([pick(name)])), name).toEqual([refused(name)]);
      expect(errors(design([pick("q")], [pick(name)])), name).toEqual([refused(name)]);
    }
    expect(errors(design([pick("coder_gender"), pick("finished"), pick("linked")]))).toEqual([]);
  });

  it("questions a and a_label each keep their own columns", () => {
    const items = design([pick("a"), pick("a_label")]);
    expect(errors(items)).toEqual([]);
    const labels = new Labels(new Map([[1, items]]), 1);
    const table = annotationsTable([row("a", answer("x")), row("a_label", answer("y"))], [coder()], [], labels);
    const columns = table.headers.slice(ANNOTATION_COLUMNS.length);
    expect(columns).toEqual(["a", "a.label", "a_label", "a_label.label"]);
    expect(table.rows[0].slice(ANNOTATION_COLUMNS.length)).toEqual(["x", "X", "y", "y"]);
    expect(unique(table.headers)).toBe(true);
  });

  it("a question's extra columns have a dot: label, special, comment, json", () => {
    const special = { done: true, skip: false, values: [{ special: "dont_know" as const }], comment: "hm" };
    const several = { done: true, skip: false, values: [{ value: "x" }, { value: "y" }] };
    const items = design([pick("a"), pick("b")]);
    const labels = new Labels(new Map([[1, items]]), 1);
    const table = annotationsTable([row("a", special), row("b", several)], [coder()], [], labels);
    expect(table.headers.slice(ANNOTATION_COLUMNS.length)).toEqual([
      "a",
      "a.label",
      "a.special",
      "a.comment",
      "b",
      "b.label",
      "b.json",
    ]);
  });

  it("the coders' table has its own columns, then the loops', the test units' and the questions'", () => {
    const table = codersTable([coder({ age: answer("x") })]);
    expect(table.headers).toEqual([...CODER_COLUMNS, "finished_loop_1", "gold_finished", "age"]);
    expect(unique(table.headers)).toBe(true);
  });

  it("names differ in more than capitals, and a scale's items can't be a question's extra columns", () => {
    expect(errors(design([pick("Topic"), pick("topic")]))).toEqual([
      "The names 'Topic' and 'topic' differ only in capitals: give one another name",
    ]);
    const scale = (items: string[]) => ({
      type: "question",
      name: "media",
      variable: {
        type: "scale",
        question: "?",
        items: items.map((name) => ({ name })),
        options: [{ value: 1 }, { value: 2 }],
      },
    });
    expect(errors(design([scale(["fair", "clear"])]))).toEqual([]);
    expect(errors(design([scale(["fair", "Fair"])]))).toEqual([
      "The item names 'fair' and 'Fair' differ only in capitals: give one another name",
    ]);
    expect(errors(design([scale(["label", "Json"])]))).toEqual([
      "A scale item can't be called 'label': media.label is a column of the data download (label, special, comment, json)",
      "A scale item can't be called 'Json': media.json is a column of the data download (label, special, comment, json)",
    ]);
  });
});
