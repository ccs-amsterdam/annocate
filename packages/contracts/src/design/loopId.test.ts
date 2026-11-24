import { describe, expect, it } from "vitest";
import { loopIds, loopTitle, nextLoopId, unitLoops } from "./item.js";
import { effectiveLoopUnits } from "./unitLoop.js";
import { collectQuestions, validateDesignItems } from "./validation.js";
import { loopDependencies } from "./shownFields.js";
import { loopShareColumns } from "./assignment.js";

const session = { type: "session", invite: { mode: "crowd" } };
const question = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });
/** A unit loop with one question; `id: undefined` leaves the id out. */
const loop = (id: string | undefined, name: string, extra: object = {}) => ({
  type: "unit_loop",
  ...(id === undefined ? {} : { id }),
  children: [{ type: "layout", template: "" }, question(name)],
  ...extra,
});
const errors = (items: object[]) =>
  validateDesignItems(items as never)
    .filter((i) => !i.warning)
    .map((i) => `${i.path.join(".")}: ${i.message}`);

describe("a unit loop's id", () => {
  it("is required: a loop without one is an error, as is an id that isn't loop_<number>", () => {
    expect(errors([session, loop("loop_1", "a")])).toEqual([]);
    const needsId =
      "A unit loop needs an id of its own: loop_1, loop_2, … (a new loop gets the next number never used)";
    expect(errors([session, loop(undefined, "a")])).toEqual([`1.id: ${needsId}`]);
    for (const bad of ["", "1", "loop_0", "loop_01", "loop_x", "Loop_1", "loop_1 "]) {
      expect(errors([session, loop(bad, "a")]), bad).toEqual([`1.id: ${needsId}`]);
    }
  });

  it("is one loop's: the same id twice is an error", () => {
    expect(errors([session, loop("loop_1", "a"), loop("loop_1", "b")])).toEqual([
      "2.id: Another unit loop has the id 'loop_1' too: give this loop a new id",
    ]);
  });

  it("says nothing about the loop's place: any order of ids is fine", () => {
    expect(errors([session, loop("loop_7", "a"), loop("loop_2", "b")])).toEqual([]);
  });

  it("a new loop gets the next number never used", () => {
    expect(nextLoopId([])).toBe("loop_1");
    expect(nextLoopId(["loop_1", "loop_2"])).toBe("loop_3");
    // Not the first free number: loop_2 was a loop once (deleted since), and stays that loop's
    expect(nextLoopId(["loop_1", "loop_3"])).toBe("loop_4");
    expect(nextLoopId(["loop_10", "loop_9", "not an id"])).toBe("loop_11");
    const design = [session, loop("loop_4", "a"), loop("loop_2", "b")];
    expect(loopIds(design)).toEqual(["loop_4", "loop_2"]);
    expect(nextLoopId([...loopIds(design), "loop_6"])).toBe("loop_7");
  });

  it("is the loop's key everywhere: its questions, what it depends on, what selects its units", () => {
    const design = [session, question("role"), loop("loop_5", "a", { condition: { script: "$var.role.answered" } })];
    expect(unitLoops(design).map((l) => l.key)).toEqual(["loop_5"]);
    expect(collectQuestions(design).loopOf.get("a")).toBe("loop_5");
    expect(loopDependencies(design)).toEqual(new Map([["loop_5", ["role"]]]));
    expect([...loopShareColumns(design).keys()]).toEqual(["loop_5"]);
  });

  it("titles a loop without a label", () => {
    expect(loopTitle({ id: "loop_3", label: " Main " })).toBe("Main");
    expect(loopTitle({ id: "loop_3" })).toBe("loop_3");
  });
});

describe("the previous loop", () => {
  it("is the loop before it in the design, whatever the ids", () => {
    const design = [
      session,
      loop("loop_3", "a"),
      loop("loop_1", "b", { units: { sameAsPrevious: true } }),
      loop("loop_2", "c", { units: { sameAsPrevious: true } }),
    ];
    expect(errors(design)).toEqual([]);
    const loops = unitLoops(design);
    const resolved = loops.map(({ loop }, at) => effectiveLoopUnits(loop, true, loops[at - 1]?.key).sameAs);
    expect(resolved).toEqual([undefined, "loop_3", "loop_1"]);
  });

  it("the first loop has none", () => {
    expect(errors([session, loop("loop_2", "a", { units: { sameAsPrevious: true } }), loop("loop_1", "b")])).toEqual([
      "1.units.sameAsPrevious: There is no previous loop to take the units of",
    ]);
  });
});
