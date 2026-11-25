import { describe, expect, it } from "vitest";
import { strFromU8 } from "fflate";
import { buildDownload, downloadName, type DownloadOptions } from "./buildDownload";
import type { RawExport } from "./rawExport";

const now = new Date("2026-11-20T10:00:00Z");

const design = (id: number, number: number) =>
  ({ id, number, items: [], units: { fields: [] } }) as unknown as RawExport["designVersions"][number];

const at = new Date("2026-11-01T10:00:00Z");
const answer = (designVersionId: number, retiredAt: Date | null = null): RawExport["answers"][number] => ({
  id: designVersionId,
  unitId: 1,
  externalId: "u1",
  sessionId: 1,
  coder: "p1",
  variable: "tone",
  value: { done: true, skip: false, values: [{ value: "1" }] },
  designVersionId,
  unitVersionId: null,
  deviceId: null,
  assigned: false,
  timing: null,
  servedAt: null,
  created: at,
  updated: at,
  ...(retiredAt ? { retiredAt } : {}),
});

/** An export with three design versions: v1 only under a reset answer, v2 under a live one, v3 live but unanswered. */
const raw: RawExport = {
  manifest: {} as RawExport["manifest"],
  answers: [],
  units: [],
  sessions: [],
  coders: [{ coder: "anna", kind: "expert", created: "2026-01-05T10:00:00.000Z" }],
  designVersions: [design(11, 1), design(12, 2), design(13, 3), design(14, 4)],
  deployments: [
    { designVersionId: 12, client: { release: "0.1.0", commit: "abc" } } as unknown as RawExport["deployments"][number],
  ],
  sets: [],
  devices: [],
  deletions: [],
};

const options: DownloadOptions = {
  study: "Framing: a study",
  liveDesignVersionId: 13,
  withLabels: true,
  withReset: false,
  format: "csv",
  now,
};

describe("the data download", () => {
  it("as CSV: a file per table, the README and the live design", () => {
    const files = buildDownload(raw, options);
    expect(Object.keys(files)).toEqual([
      "README.txt",
      "annotations.csv",
      "sessions.csv",
      "coders.csv",
      "units.csv",
      "variables.csv",
      "timings.csv",
      "devices.csv",
      "display_changes.csv",
      "deleted_coders.csv",
      "designs/v3.json",
    ]);
    expect(strFromU8(files["README.txt"])).toContain("Data of Framing: a study");
  });

  it("as Excel: one workbook instead of the CSV files", () => {
    const files = buildDownload(raw, { ...options, format: "xlsx" });
    expect(Object.keys(files)).toEqual(["README.txt", "results.xlsx", "designs/v3.json"]);
  });

  it("with reset answers: their table too", () => {
    expect(Object.keys(buildDownload(raw, { ...options, withReset: true }))).toContain("reset_answers.csv");
  });

  it("holds the design versions answers were given under, with the release they ran on", () => {
    const answered = { ...raw, answers: [answer(12), answer(11, at)] };
    const files = buildDownload(answered, options);
    expect(Object.keys(files).filter((f) => f.startsWith("designs/"))).toEqual(["designs/v2.json", "designs/v3.json"]);
    expect(JSON.parse(strFromU8(files["designs/v2.json"])).client).toEqual({ release: "0.1.0", commit: "abc" });
    expect(JSON.parse(strFromU8(files["designs/v3.json"])).client).toEqual({ release: "unknown", commit: "unknown" });
    // A version only a reset answer was given under: only with the reset answers
    const withReset = buildDownload(answered, { ...options, withReset: true });
    expect(Object.keys(withReset)).toContain("designs/v1.json");
  });

  it("is named after the study and the day", () => {
    expect(downloadName("Framing: a study", now)).toBe("Framing_a_study_2026-11-20.zip");
  });
});
