import { describe, it, expect } from "vitest";
import { assignAllColumns, csvToUnits, initialMapping, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a simple CSV", () => {
    const { headers, rows } = parseCsv("id,text\n1,hello\n2,world\n");
    expect(headers).toEqual(["id", "text"]);
    expect(rows).toEqual([
      ["1", "hello"],
      ["2", "world"],
    ]);
  });

  it("handles quoted fields with embedded commas and quotes", () => {
    const { headers, rows } = parseCsv('id,text\n1,"hello, world"\n2,"she said ""hi"""\n');
    expect(headers).toEqual(["id", "text"]);
    expect(rows).toEqual([
      ["1", "hello, world"],
      ["2", 'she said "hi"'],
    ]);
  });

  it("handles a file with no trailing newline", () => {
    const { rows } = parseCsv("id,text\n1,a\n2,b");
    expect(rows).toEqual([
      ["1", "a"],
      ["2", "b"],
    ]);
  });
});

describe("csvToUnits", () => {
  const headers = ["id", "Text", "count", "ok", "notes"];
  const rows = [
    ["1", "hello", "42", "true", "x"],
    ["2", "world", "", "false", "y"],
  ];

  it("uploads the columns given a name, with their (inferred) types", () => {
    const mapping = assignAllColumns(headers, rows, initialMapping(headers, rows, []), [], 0);
    expect(mapping.map((m) => [m.field, m.type])).toEqual([
      ["", "number"],
      ["text", "text"],
      ["count", "number"],
      ["ok", "boolean"],
      ["notes", "text"],
    ]);
    // Skip the notes column.
    const chosen = mapping.map((m) => (m.column === 4 ? { ...m, field: "" } : m));
    const result = csvToUnits(headers, rows, 0, chosen);
    expect(result.fields).toEqual([
      { name: "text", type: "text" },
      { name: "count", type: "number" },
      { name: "ok", type: "boolean" },
    ]);
    expect(result.units).toEqual([
      { externalId: "1", data: { text: "hello", count: 42, ok: true } },
      { externalId: "2", data: { text: "world", count: null, ok: false } },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("links columns to the job's fields, leaves unmapped fields empty, and reports what doesn't fit", () => {
    const jobFields = [
      { name: "text", type: "text" as const },
      { name: "count", type: "number" as const },
      { name: "source", type: "text" as const },
    ];
    const mapping = initialMapping(headers, rows, jobFields);
    expect(mapping.map((m) => m.field)).toEqual(["", "text", "count", "", ""]);
    const result = csvToUnits(headers, rows, 0, mapping, jobFields);
    expect(result.units[0].data).toEqual({ text: "hello", count: 42, source: null });

    const bad = csvToUnits(["id", "count"], [["1", "many"], ["2", "n/a"]], 0, [{ column: 1, field: "count", type: "text" }], jobFields);
    expect(bad.errors).toEqual(["count: 2 values aren't numbers ('many', 'n/a')"]);
    const names = csvToUnits(headers, rows, 0, [
      { column: 1, field: "a b", type: "text" },
      { column: 4, field: "x", type: "text" },
      { column: 3, field: "x", type: "text" },
    ]);
    expect(names.errors).toEqual([
      "Text: Field name: only letters, digits and _, not starting with a digit",
      "notes: Two columns are uploaded as x",
      "ok: Two columns are uploaded as x",
    ]);
  });

  it("checks the ids", () => {
    const result = csvToUnits(["id", "t"], [["1", "a"], ["1", "b"], ["", "c"]], 0, [{ column: 1, field: "t", type: "text" }]);
    expect(result.errors).toEqual(["Some rows have no id", "The id '1' occurs more than once in id"]);
  });
});
