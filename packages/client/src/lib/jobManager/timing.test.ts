import { describe, expect, it } from "vitest";
import { QuestionTimer } from "./timing";

describe("QuestionTimer", () => {
  it("counts the time on screen over visits, hidden time apart, and answer changes", () => {
    let now = 0;
    const timer = new QuestionTimer(() => now);
    timer.show("c:age");
    now = 1000;
    timer.visibility(true); // another tab
    now = 5000;
    timer.visibility(false);
    now = 6000;
    timer.answered("c:age", true);
    timer.leave();
    expect(timer.take("c:")).toEqual({ age: { firstMs: 2000, totalMs: 2000, hiddenMs: 4000, edits: 1 } });
    expect(timer.take("c:")).toEqual({}); // sent

    // Back to it: time adds up; the same answer again is no edit
    now = 10_000;
    timer.show("c:age");
    now = 10_500;
    timer.answered("c:age", false);
    timer.leave();
    expect(timer.take("c:")).toEqual({ age: { firstMs: 2000, totalMs: 2500, hiddenMs: 4000, edits: 1 } });
  });

  it("keeps questions apart by key, and leaves out waiting time", () => {
    let now = 0;
    const timer = new QuestionTimer(() => now);
    timer.show("u:1:a");
    now = 100;
    timer.leave(); // posting
    now = 900;
    timer.show("u:1:b");
    now = 1000;
    timer.show("c:x");
    expect(timer.take("u:1:")).toEqual({
      a: { firstMs: null, totalMs: 100, hiddenMs: 0, edits: 0 },
      b: { firstMs: null, totalMs: 100, hiddenMs: 0, edits: 0 },
    });
  });
});
