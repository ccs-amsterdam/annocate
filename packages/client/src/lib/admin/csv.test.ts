import { describe, it, expect } from "vitest";
import { parseCsv, csvToUnits } from "./csv";

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
  const headers = ["id", "text", "count", "ok"];
  const rows = [
    ["1", "hello", "42", "true"],
    ["2", "world", "", "false"],
  ];

  it("infers field types for a first upload and parses typed values", () => {
    const result = csvToUnits(headers, rows, "id");
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

  it("uses the job's fields, reporting columns and values that don't fit", () => {
    const jobFields = [
      { name: "text", type: "text" as const },
      { name: "count", type: "number" as const },
    ];
    expect(csvToUnits(headers, rows, "id", jobFields).errors).toEqual(["Column not in the job's fields: ok"]);
    const bad = csvToUnits(["id", "text", "count"], [["1", "a", "many"]], "id", jobFields);
    expect(bad.errors).toEqual(["Row 2: 'many' in count is not a number"]);
  });
});
