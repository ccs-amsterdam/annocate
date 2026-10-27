import { describe, expect, it } from "vitest";
import { checkUnitData, fieldsOfUnits, inferFieldType, parseFieldValue, toUnitFieldName, unitFieldNameError } from "./unitFields.js";

describe("unit fields", () => {
  it("infers a CSV column's type from its non-empty values", () => {
    expect(inferFieldType(["42", " -1.5", "", "1e3"])).toBe("number");
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
    expect(fieldsOfUnits([{ a: null, b: "x" }, { a: 2, b: "y" }])).toEqual({
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
  });
});

describe("field names", () => {
  it("turns column headers into valid, unique names", () => {
    expect(toUnitFieldName("Headline")).toBe("headline");
    expect(toUnitFieldName("Publication date (UTC)")).toBe("publication_date_utc");
    expect(toUnitFieldName("Café-naam")).toBe("cafe_naam");
    expect(toUnitFieldName("2nd text")).toBe("_2nd_text");
    expect(toUnitFieldName("!!!")).toBe("field");
    expect(toUnitFieldName("text", new Set(["text", "text_2"]))).toBe("text_3");
    expect(unitFieldNameError("a b")).toMatch(/only letters/);
    expect(unitFieldNameError("ok_1")).toBeNull();
  });
});
