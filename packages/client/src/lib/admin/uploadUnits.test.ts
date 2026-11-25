import { describe, expect, it } from "vitest";
import type { SetGroupResponse, SetGroupWrite, UnitCreate } from "@annotinder/contracts";
import {
  UPLOAD_BATCH,
  csvUpload,
  detectColumns,
  unitsLosingRole,
  unknownCodersText,
  unknownFileCoders,
  uploadFailureText,
  uploadUnits,
  type UnitsUpload,
  type UploadApi,
} from "./uploadUnits";

const unit = (i: number): UnitCreate => ({ externalId: `u${i}`, data: { text: `text ${i}` } });
const units = (n: number) => Array.from({ length: n }, (_, i) => unit(i + 1));

function plan(over: Partial<UnitsUpload>): UnitsUpload {
  return {
    units: [],
    overwrite: false,
    overwriteCoded: false,
    setGroups: [],
    join: [],
    addedIds: [],
    seed: 1,
    ...over,
  };
}

/** A server that keeps what it gets; `failAt`: the batch (from 1) that fails. */
function server(failAt?: number) {
  const stored: UnitCreate[] = [];
  const groups: Record<string, SetGroupWrite> = {};
  let batches = 0;
  const api: UploadApi = {
    createUnits: async (body) => {
      batches++;
      if (batches === failAt) throw new Error("the server is down");
      stored.push(...body.units);
    },
    listUnits: async () => stored.map((u, i) => ({ id: i + 1, externalId: u.externalId })),
    putSetGroup: async (group, body) => {
      groups[group] = body;
    },
  };
  return { api, stored, groups };
}

describe("uploading units", () => {
  it("uploads in batches and reports progress", async () => {
    const { api, stored } = server();
    const progress: number[] = [];
    const outcome = await uploadUnits(plan({ units: units(450) }), api, (n) => progress.push(n));
    expect(outcome).toEqual({ uploaded: 450, error: null });
    expect(stored).toHaveLength(450);
    expect(progress).toEqual([0, UPLOAD_BATCH, 2 * UPLOAD_BATCH]);
  });

  it("a failing third batch: stops, says why and how many were uploaded", async () => {
    const { api, stored } = server(3);
    const outcome = await uploadUnits(plan({ units: units(1000) }), api, () => {});
    expect(outcome).toEqual({ uploaded: 400, error: "the server is down" });
    expect(stored).toHaveLength(400);
    expect(uploadFailureText(outcome, 1000)).toBe("Uploaded 400 of 1000 units, then it stopped: the server is down");
  });

  it("the file's role columns replace the column, by the units' ids", async () => {
    const { api, groups } = server();
    const cells = [
      { externalId: "u1", cell: "anna" },
      { externalId: "u2", cell: "anna;bob" },
    ];
    const outcome = await uploadUnits(
      plan({ units: units(2), setGroups: [{ group: "coder_set", cells }] }),
      api,
      () => {},
    );
    expect(outcome.error).toBeNull();
    expect(groups.coder_set.sets.map((s) => [s.name, s.unitIds])).toEqual([
      ["anna", [1, 2]],
      ["bob", [2]],
    ]);
  });

  it("sets that can't be saved: the units stay uploaded, and it says so", async () => {
    const { api } = server();
    const failing: UploadApi = { ...api, putSetGroup: () => Promise.reject(new Error("no such column")) };
    const upload = plan({
      units: units(2),
      setGroups: [{ group: "coder_set", cells: [{ externalId: "u1", cell: "a" }] }],
    });
    const outcome = await uploadUnits(upload, failing, () => {});
    expect(outcome).toEqual({ uploaded: 2, error: "no such column" });
    expect(uploadFailureText(outcome, 2)).toBe(
      "The 2 units were uploaded, but their sets were not saved: no such column",
    );
  });

  it("new units join the chosen role columns", async () => {
    const { api, groups } = server();
    const group: SetGroupResponse = { name: "coder_set", sets: [{ name: "anna", unitIds: [], ordered: false }] };
    await uploadUnits(
      plan({ units: units(2), join: [{ group, mode: "distribute" }], addedIds: ["u1", "u2"] }),
      api,
      () => {},
    );
    expect([...groups.coder_set.sets[0].unitIds].sort()).toEqual([1, 2]);
  });
});

describe("units that lose their role column", () => {
  const studyUnits = [1, 2, 3, 4].map((id) => ({ id, externalId: `u${id}` }));
  const studyGroups: SetGroupResponse[] = [
    {
      name: "coder_set",
      sets: [
        { name: "anna", unitIds: [1, 2, 3], ordered: false },
        { name: "bob", unitIds: [3, 4], ordered: false },
      ],
    },
  ];

  it("counts the column's units that are not in the file", () => {
    const file = [{ group: "coder_set" as const, cells: [{ externalId: "u1", cell: "anna" }] }];
    expect(unitsLosingRole(file, studyGroups, studyUnits)).toEqual([{ group: "coder_set", count: 3 }]);
  });

  it("is empty when every unit of the column is in the file, or the column is new", () => {
    const cells = studyUnits.map((u) => ({ externalId: u.externalId, cell: "anna" }));
    expect(unitsLosingRole([{ group: "coder_set", cells }], studyGroups, studyUnits)).toEqual([]);
    expect(unitsLosingRole([{ group: "part_set", cells: [] }], studyGroups, studyUnits)).toEqual([]);
  });
});

describe("what a CSV makes", () => {
  const csv = {
    name: "units.csv",
    headers: ["text", "ID", "coder_set", "test_set"],
    rows: [
      ["a", "u1", "anna", "gold"],
      ["b", "u2", "anna;bob", ""],
    ],
    hints: [],
  };
  const mapping = [{ column: 0, field: "text", type: "text" as const }];

  it("finds the id column and the role columns by their names", () => {
    expect(detectColumns(csv.headers)).toEqual({ idColumn: 1, roles: { 2: "coder_set", 3: "test_set" } });
    expect(detectColumns(["text", "source"])).toEqual({ idColumn: 0, roles: {} });
  });

  it("the units, and the role columns' cells by unit id", () => {
    const upload = csvUpload(csv, 1, mapping, { 2: "coder_set" }, []);
    expect(upload.errors).toEqual([]);
    expect(upload.units.map((u) => u.externalId)).toEqual(["u1", "u2"]);
    expect(upload.setGroups).toEqual([
      {
        group: "coder_set",
        cells: [
          { externalId: "u1", cell: "anna" },
          { externalId: "u2", cell: "anna;bob" },
        ],
      },
    ]);
  });

  it("says what blocks the upload: no id column, a role twice, a test set that isn't one", () => {
    expect(csvUpload(csv, -1, mapping, {}, []).errors).toEqual([
      "Choose the column with each unit's id: set its type to Unit id",
    ]);
    expect(csvUpload(csv, 1, mapping, { 2: "coder_set", 3: "coder_set" }, []).errors).toEqual([
      "Two columns are uploaded as coder_set",
    ]);
    const errors = csvUpload(csv, 1, mapping, { 2: "test_set" }, []).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Column coder_set: /);
  });
});

describe("a file's coder_set column", () => {
  const cells = (...values: string[]) => [
    { group: "coder_set" as const, cells: values.map((cell, i) => ({ externalId: `u${i}`, cell })) },
  ];

  it("names expert coders of the study only: the others are found, each once, as written", () => {
    expect(unknownFileCoders(cells("anna", "anna;bob", "carl#2;Anna", ""), ["anna", "carl"])).toEqual(["bob", "Anna"]);
    expect(unknownFileCoders(cells("anna", "anna;carl"), ["anna", "carl"])).toEqual([]);
  });

  it("other role columns name no coders; a cell that can't be read has its own error", () => {
    const parts = [{ group: "part_set" as const, cells: [{ externalId: "u1", cell: "pre" }] }];
    expect(unknownFileCoders(parts, [])).toEqual([]);
    expect(unknownFileCoders(cells("anna#x"), [])).toEqual([]);
  });

  it("says who to add first", () => {
    expect(unknownCodersText(["bob"])).toContain("names a coder who isn't an expert coder of this study: bob.");
    expect(unknownCodersText(["bob", "dora"])).toContain("coders who aren't an expert coder of this study: bob, dora.");
  });
});
