import { describe, it, expect } from "vitest";
import { parseCsv, csvRowsToUnits } from "./csv";

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

describe("csvRowsToUnits", () => {
  it("maps rows to units, excluding the id column from data", () => {
    const units = csvRowsToUnits(
      ["id", "text", "source"],
      [
        ["1", "hello", "news"],
        ["2", "world", "blog"],
      ],
      "id",
    );
    expect(units).toEqual([
      { externalId: "1", data: { text: "hello", source: "news" } },
      { externalId: "2", data: { text: "world", source: "blog" } },
    ]);
  });
});
