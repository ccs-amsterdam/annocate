import { describe, expect, it } from "vitest";
import { deletedLoopWarning, finishedPerLoop, newLoopId } from "./loops";
import { defaultItemForType } from "./newItem";

const loop = (id: string, label?: string) => ({ type: "unit_loop", id, label, children: [] });

describe("a new loop's id", () => {
  it("is the next number no loop the editor knows of has: the draft, as saved, and the deployed design", () => {
    expect(newLoopId(new Set(), [[]])).toBe("loop_1");
    // The draft lost loop_2 since it was saved; the deployed design had a loop_4
    const designs = [[loop("loop_1")], [loop("loop_1"), loop("loop_2")], [loop("loop_4")]];
    expect(newLoopId(new Set(), designs)).toBe("loop_5");
  });

  it("isn't given twice in one editing session, also when the loop it went to was deleted", () => {
    const seen = new Set<string>();
    expect(newLoopId(seen, [[loop("loop_1")]])).toBe("loop_2");
    // The new loop is deleted again (the draft is back to one loop): the next one still gets a new id
    expect(newLoopId(seen, [[loop("loop_1")]])).toBe("loop_3");
  });

  it("is on the loop the editor adds", () => {
    expect(defaultItemForType("unit_loop", "x", "loop_7")).toMatchObject({ type: "unit_loop", id: "loop_7" });
  });
});

describe("deleting a loop coders worked in", () => {
  const finished = (first: number) => [
    { loop: "loop_1", title: "News", units: first },
    { loop: "loop_2", title: "loop_2", units: 0 },
  ];
  const progress = finishedPerLoop([{ finished: finished(2) }, { finished: finished(3) }]);
  const design = [loop("loop_1", "News"), loop("loop_2")];

  it("adds up the units coders finished per loop", () => {
    expect([...progress]).toEqual([
      ["loop_1", 5],
      ["loop_2", 0],
    ]);
  });

  it("warns, naming the loop and what coders did in it", () => {
    expect(deletedLoopWarning(design, [loop("loop_2")], progress)).toBe(
      "Coders already worked in this unit loop:\nNews (loop_1): coders finished 5 unit codings in it\n" +
        "Once this design is deployed, coders no longer get the loop (their answers are kept).",
    );
  });

  it("says nothing for a loop without finished units, or when no loop goes", () => {
    expect(deletedLoopWarning(design, [loop("loop_1", "News")], progress)).toBeNull();
    expect(deletedLoopWarning(design, design, progress)).toBeNull();
    expect(deletedLoopWarning(design, [], new Map())).toBeNull();
  });
});
