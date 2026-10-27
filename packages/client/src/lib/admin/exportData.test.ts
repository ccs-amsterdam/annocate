import { describe, expect, it } from "vitest";
import type { AnnotationRow, CoderProgress } from "@annotinder/contracts";
import { annotationsTable, answerText, codersTable, toCsv } from "./exportData";

const at = new Date("2026-11-01T10:00:00Z");
const row = (unitId: number, coderId: number, variable: string, value: AnnotationRow["value"], minutes = 0): AnnotationRow => ({
  id: unitId * 100 + coderId,
  unitId,
  externalId: `u${unitId}`,
  coderId,
  participantId: coderId === 1 ? "p1" : null,
  variable,
  value,
  codebookId: 2,
  unitVersionId: null,
  created: new Date(at.getTime() + minutes * 60_000),
  updated: new Date(at.getTime() + minutes * 60_000),
});
const coder = (id: number, extra: Partial<CoderProgress> = {}): CoderProgress => ({
  id,
  inviteId: 1,
  inviteLabel: "Open link",
  started: at,
  lastActive: at,
  answers: 0,
  finished: { main: 1 },
  variables: {},
  ended: null,
  ...extra,
});

describe("data download", () => {
  it("writes answers as text: values joined, scale items apart, spans with their text, skipped empty", () => {
    expect(answerText({ done: true, skip: false, values: [{ value: "a" }, { value: "b" }] })).toBe("a; b");
    const scale = { done: true, skip: false, values: [{ item: "tech", value: 4 }, { item: "art", value: 2 }] };
    expect(answerText(scale, "art")).toBe("2");
    const span = { done: true, skip: false, spans: [{ id: "s1", field: "text", value: "actor", slices: [{ offset: 0, length: 4, text: "Lena" }] }] };
    expect(answerText(span)).toBe("actor: Lena");
    expect(answerText({ done: true, skip: true })).toBe("");
  });

  it("makes a row per unit and coder, a column per question in codebook order", () => {
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
      "coder_id",
      "participant_id",
      "invitation",
      "first_answer",
      "last_change",
      "codebook_id",
      "sentiment",
      "topic",
      "interest.tech",
    ]);
    expect(table.rows).toEqual([
      ["u1", "1", "p1", "Open link", "2026-11-01T10:00:00.000Z", "2026-11-01T10:02:00.000Z", "2", "pos", "politics", ""],
      ["u1", "2", "", "Open link", "2026-11-01T10:00:00.000Z", "2026-11-01T10:00:00.000Z", "2", "neg", "", ""],
      ["u2", "1", "p1", "Open link", "2026-11-01T10:00:00.000Z", "2026-11-01T10:00:00.000Z", "2", "", "", "4"],
    ]);
  });

  it("makes a row per coder with their coder-level answers and how they ended", () => {
    const table = codersTable([
      coder(1, {
        participantId: "p1",
        variables: { age: { done: true, skip: false, values: [{ value: 42 }] } },
        ended: { item: "done", outcome: "complete", at },
      }),
    ]);
    expect(table.headers).toEqual(["coder_id", "participant_id", "invitation", "started", "last_active", "ended", "ended_at", "finished_main", "age"]);
    expect(table.rows[0]).toEqual(["1", "p1", "Open link", at.toISOString(), at.toISOString(), "complete", at.toISOString(), "1", "42"]);
  });

  it("quotes CSV cells that need it", () => {
    expect(toCsv({ headers: ["a", "b"], rows: [['x, "y"', "z"]] })).toBe('\uFEFFa,b\r\n"x, ""y""",z\r\n');
  });
});
