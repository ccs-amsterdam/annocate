import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readRawExport } from "./rawExport";

const manifest = (counts: Record<string, number>) =>
  strToU8(
    JSON.stringify({
      format: 1,
      study: { id: 1, name: "S" },
      exported: "2026-11-22T10:00:00Z",
      release: "0.1.0",
      counts,
    }),
  );

describe("readRawExport", () => {
  it("reads the JSON lines of each file", () => {
    const zip = zipSync({
      "answers.jsonl": strToU8('{"id":1}\n{"id":2}\n'),
      "manifest.json": manifest({ "answers.jsonl": 2 }),
    });
    const read = readRawExport(zip);
    expect(read.answers).toEqual([{ id: 1 }, { id: 2 }]);
    expect(read.units).toEqual([]);
    expect(read.manifest.study.name).toBe("S");
  });

  it("refuses an export whose rows don't match the manifest, or without one", () => {
    const short = zipSync({
      "answers.jsonl": strToU8('{"id":1}\n'),
      "manifest.json": manifest({ "answers.jsonl": 2 }),
    });
    expect(() => readRawExport(short)).toThrow(/incomplete \(answers.jsonl\)/);
    expect(() => readRawExport(zipSync({ "answers.jsonl": strToU8("") }))).toThrow(/no manifest/);
  });
});
