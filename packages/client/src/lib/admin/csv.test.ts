import { describe, it, expect } from "vitest";
import { assignAllColumns, columnTypes, csvToUnits, initialMapping, parseCsv } from "./csv";

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

  it("reads Windows line ends, and a newline in a quoted cell", () => {
    const { headers, rows, hints } = parseCsv('id,text\r\n1,"two\nlines"\r\n2,b\r\n');
    expect(headers).toEqual(["id", "text"]);
    expect(rows).toEqual([
      ["1", "two\nlines"],
      ["2", "b"],
    ]);
    expect(hints).toEqual([]);
  });

  it("leaves out a byte order mark", () => {
    expect(parseCsv("\uFEFFid,text\n1,a\n").headers).toEqual(["id", "text"]);
  });

  it("reads a file separated by semicolons, and says so", () => {
    const { headers, rows, separator, hints } = parseCsv('id;text;coder_set\n1;"a; b";anna\n2;c,d;bob\n');
    expect(separator).toBe(";");
    expect(headers).toEqual(["id", "text", "coder_set"]);
    expect(rows).toEqual([
      ["1", "a; b", "anna"],
      ["2", "c,d", "bob"],
    ]);
    expect(hints).toEqual(["Read as separated by semicolons (;): the first line has no commas."]);
  });

  it("keeps semicolons in the cells of a comma file (anna;bob)", () => {
    const { separator, rows } = parseCsv("id,coder_set\n1,anna;bob\n");
    expect(separator).toBe(",");
    expect(rows).toEqual([["1", "anna;bob"]]);
  });

  it("says where a quote is never closed", () => {
    const { rows, hints } = parseCsv('id,text\n1,a\n2,"b\n3,c\n');
    expect(rows).toEqual([
      ["1", "a"],
      ["2", "b\n3,c\n"],
    ]);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("line 3 is never closed");
  });

  it("reads a quote inside a cell as a character", () => {
    const { rows, hints } = parseCsv('id,text\n1,5" screen\n2,"quoted" then more\n');
    expect(rows).toEqual([
      ["1", '5" screen'],
      ["2", "quoted then more"],
    ]);
    expect(hints).toEqual([]);
  });

  it("says how many rows have more or fewer cells than the header", () => {
    const { rows, hints } = parseCsv("id,text\n1\n2,b,extra\n3,c\n");
    expect(rows).toEqual([["1"], ["2", "b", "extra"], ["3", "c"]]);
    expect(hints).toEqual([
      "2 rows have more or fewer cells than the first line (2): missing cells are empty, extra cells are left out.",
    ]);
    // A short row's missing cell is empty, an extra cell is not uploaded
    const units = csvToUnits(["id", "text"], rows, 0, [{ column: 1, field: "text", type: "text" }]).units;
    expect(units.map((u) => u.data.text)).toEqual(["", "b", "c"]);
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

  it("links columns to the study's fields, leaves unmapped fields empty, and reports what doesn't fit", () => {
    const studyFields = [
      { name: "text", type: "text" as const },
      { name: "count", type: "number" as const },
      { name: "source", type: "text" as const },
    ];
    const mapping = initialMapping(headers, rows, studyFields);
    expect(mapping.map((m) => m.field)).toEqual(["", "text", "count", "", ""]);
    const result = csvToUnits(headers, rows, 0, mapping, studyFields);
    expect(result.units[0].data).toEqual({ text: "hello", count: 42, source: null });

    const bad = csvToUnits(
      ["id", "count"],
      [
        ["1", "many"],
        ["2", "n/a"],
      ],
      0,
      [{ column: 1, field: "count", type: "text" }],
      studyFields,
    );
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

  it("two columns with the same header: one field needs two names", () => {
    const twice = ["id", "text", "text"];
    const cells = [["1", "a", "b"]];
    const studyFields = [{ name: "text", type: "text" as const }];
    const linked = initialMapping(twice, cells, studyFields);
    expect(csvToUnits(twice, cells, 0, linked, studyFields).errors).toEqual([
      "text: Two columns are uploaded as text",
      "text: Two columns are uploaded as text",
    ]);
    // "Use column names" gives the second its own name
    const named = assignAllColumns(twice, cells, initialMapping(twice, cells, []), [], 0);
    expect(named.map((m) => m.field)).toEqual(["", "text", "text_2"]);
  });

  it("checks the ids", () => {
    const result = csvToUnits(
      ["id", "t"],
      [
        ["1", "a"],
        ["1", "b"],
        ["", "c"],
      ],
      0,
      [{ column: 1, field: "t", type: "text" }],
    );
    expect(result.errors).toEqual(["Some rows have no id", "The id '1' occurs more than once in id"]);
  });
});

describe("columnTypes", () => {
  it("types columns by their values, answer columns as text", () => {
    expect(
      columnTypes(
        ["n", "answer_n", "feedback_n"],
        [
          ["1", "2", "3"],
          ["4", "5", "6"],
        ],
      ),
    ).toEqual(["number", "text", "text"]);
  });
});
