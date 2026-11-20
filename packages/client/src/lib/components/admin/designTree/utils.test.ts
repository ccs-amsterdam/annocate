import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { insertableTypesAt, singleLoop } from "./utils";

const session = (uses?: object) => ({ type: "session", params: [], ...(uses ? { uses } : {}) });
const question = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });
const loop = (key: string) => ({
  type: "unit_loop",
  _key: key,
  layout: { template: "" },
  children: [question(`${key}_q`)],
});
const items = (...list: object[]) => list as unknown as TopLevelItem[];

describe("what the editor offers, by what the design uses", () => {
  it("annotating only: nothing outside the one loop, whose items are the top level", () => {
    const design = items(session({ content: "annotate", experiment: true }), loop("L"));
    expect(insertableTypesAt(design, { into: null })).toEqual([]);
    expect(insertableTypesAt(design, { into: "L" })).toEqual(["question", "show_if", "end"]);
    expect(singleLoop(design)).toMatchObject({ _key: "L" });
    // Worked out from the design: one loop and nothing else
    expect(singleLoop(items(session(), loop("L")))).toMatchObject({ _key: "L" });
  });

  it("questions only: no unit loops; computed items with an experiment", () => {
    expect(
      insertableTypesAt(items(session({ content: "questions", experiment: false }), question("q")), { into: null }),
    ).toEqual(["question", "show_if", "end"]);
    expect(
      insertableTypesAt(items(session({ content: "questions", experiment: true }), question("q")), { into: null }),
    ).toEqual(["question", "computed", "show_if", "end"]);
  });

  it("both: questions, loops, and computed items with an experiment", () => {
    const design = items(session({ content: "both", experiment: false }), question("q"), loop("L"));
    expect(insertableTypesAt(design, { into: null })).toEqual(["question", "unit_loop", "show_if", "end"]);
    expect(singleLoop(design)).toBeNull();
  });
});
