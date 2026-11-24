import { afterEach, describe, expect, it } from "vitest";
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

describe("QuestionTimer and the page", () => {
  /** A page that can be hidden, with whoever follows that. */
  function page() {
    const listeners = new Set<() => void>();
    const document = {
      visibilityState: "visible",
      addEventListener: (_type: string, listener: () => void) => void listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => void listeners.delete(listener),
    };
    globalThis.document = document as unknown as Document;
    const show = (visible: boolean) => {
      document.visibilityState = visible ? "visible" : "hidden";
      for (const listener of listeners) listener();
    };
    return { listeners, show };
  }
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "document");
  });

  it("follows the page while it is used: not after dispose, again after listen", () => {
    const { listeners, show } = page();
    let now = 0;
    const timer = new QuestionTimer(() => now);
    expect(listeners.size).toBe(1);
    timer.show("c:age");
    show(false);
    now = 1000;
    show(true);
    timer.dispose();
    expect(listeners.size).toBe(0);
    timer.listen();
    timer.listen();
    expect(listeners.size).toBe(1);
    now = 1500;
    timer.leave();
    expect(timer.take("c:")).toEqual({ age: { firstMs: null, totalMs: 500, hiddenMs: 1000, edits: 0 } });
  });
});
