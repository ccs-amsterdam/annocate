import { describe, expect, it } from "vitest";
import {
  UnitsSpecSchema,
  addedFields,
  checkUnitData,
  isAnswerColumn,
  fieldsOfUnits,
  inferFieldType,
  parseFieldValue,
  toUnitFieldName,
  unitFieldNameError,
} from "./unitFields.js";

describe("unit fields", () => {
  it("infers a CSV column's type from its non-empty values", () => {
    expect(inferFieldType(["42", " -1.5", "", "0.5"])).toBe("number");
    expect(inferFieldType(["true", "FALSE", ""])).toBe("boolean");
    expect(inferFieldType(["42", "abc"])).toBe("text");
    expect(inferFieldType(["", ""])).toBe("text");
  });

  it("parses cells as typed values; empty number/boolean cells are null", () => {
    expect(parseFieldValue("42", "number")).toBe(42);
    expect(parseFieldValue("", "number")).toBeNull();
    expect(parseFieldValue("x", "number")).toBeUndefined();
    expect(parseFieldValue("True", "boolean")).toBe(true);
    expect(parseFieldValue("", "text")).toBe("");
  });

  it("takes the fields of a first upload, refusing mixed types", () => {
    expect(
      fieldsOfUnits([
        { a: null, b: "x" },
        { a: 2, b: "y" },
      ]),
    ).toEqual({
      fields: [
        { name: "a", type: "number" },
        { name: "b", type: "text" },
      ],
    });
    expect(fieldsOfUnits([{ a: 1 }, { a: "x" }])).toHaveProperty("error");
  });

  it("checks later units against the fields", () => {
    const fields = [
      { name: "a", type: "number" as const },
      { name: "b", type: "text" as const },
    ];
    expect(checkUnitData({ a: 1, b: "x" }, fields)).toBeNull();
    expect(checkUnitData({ a: null, b: "x" }, fields)).toBeNull();
    expect(checkUnitData({ a: "1", b: "x" }, fields)).toMatch(/is number/);
    expect(checkUnitData({ a: 1 }, fields)).toMatch(/Missing field 'b'/);
    expect(checkUnitData({ a: 1, b: "x", c: 2 }, fields)).toMatch(/Unknown field 'c'/);
    // Columns with a role are sets, not data: never given, never missing
    const withSet = [
      ...fields,
      { name: "coder_set", type: "set" as const },
      { name: "test_set", type: "test_set" as const },
    ];
    expect(checkUnitData({ a: 1, b: "x" }, withSet)).toBeNull();
    expect(checkUnitData({ a: 1, b: "x", coder_set: "anna" }, withSet)).toMatch(/is a column with a role/);
    expect(checkUnitData({ a: 1, b: "x", test_set: "gold" }, withSet)).toMatch(/is a column with a role/);
    // and can't be added as data
    expect(addedFields([{ a: 1, b: "x", part_set: "pre" }], fields)).toMatchObject({
      error: expect.stringContaining("role"),
    });
  });

  it("types answer columns as text, and lets them hold any value (cells like 3..5 or a|b)", () => {
    expect(fieldsOfUnits([{ answer_score: 3 }, { answer_score: "3..5" }])).toEqual({
      fields: [{ name: "answer_score", type: "text" }],
    });
    // Also a column typed number before: an answer-key cell fits
    const fields = [{ name: "answer_score", type: "number" as const }];
    expect(checkUnitData({ answer_score: "3..5" }, fields)).toBeNull();
    expect(checkUnitData({ feedback_score: 4 }, [{ name: "feedback_score", type: "text" as const }])).toBeNull();
    expect(isAnswerColumn("answer_")).toBe(false);
    expect(isAnswerColumn("score_answer")).toBe(false);
  });

  it("gives the columns with a role their type, and only them", () => {
    expect(UnitsSpecSchema.safeParse({ fields: [{ name: "test_set", type: "test_set" }] }).success).toBe(true);
    expect(UnitsSpecSchema.safeParse({ fields: [{ name: "coder_set", type: "set" }] }).success).toBe(true);
    expect(UnitsSpecSchema.safeParse({ fields: [{ name: "test_set", type: "set" }] }).success).toBe(false);
    expect(UnitsSpecSchema.safeParse({ fields: [{ name: "coder_set", type: "text" }] }).success).toBe(false);
    expect(UnitsSpecSchema.safeParse({ fields: [{ name: "coders", type: "set" }] }).success).toBe(false);
  });
});

describe("field names", () => {
  it("turns column headers into valid, unique names", () => {
    expect(toUnitFieldName("Headline")).toBe("headline");
    expect(toUnitFieldName("Publication date (UTC)")).toBe("publication_date_utc");
    expect(toUnitFieldName("Café-naam")).toBe("cafe_naam");
    expect(toUnitFieldName("2nd text")).toBe("field_2nd_text");
    expect(toUnitFieldName("!!!")).toBe("field");
    expect(toUnitFieldName("text", new Set(["text", "text_2"]))).toBe("text_3");
    expect(unitFieldNameError("a b")).toMatch(/only letters/);
    expect(unitFieldNameError("ok_1")).toBeNull();
  });
});
