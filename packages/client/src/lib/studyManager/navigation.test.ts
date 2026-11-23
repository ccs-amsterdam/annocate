import type { InLoopItem, TopLevelItem, VariableValue } from "@annotinder/contracts";
import { itemName } from "@annotinder/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { StudyManager } from "./StudyManager";
import { fakeCoderServer, type FakeCoderServer, type FakeUnit } from "./fakeCoderServer";

// Navigating a coding session (StudyManager) against an in-memory server
// with the real server's rules (fakeCoderServer): going back and forward,
// jumping in the navigation menu, changing earlier answers, reloads and
// reopening after the end.

const confirm = (name: string): TopLevelItem => ({
  name,
  type: "question",
  variable: { type: "confirm", question: name },
});
const pickQ = (name: string, options = ["A", "B"]): InLoopItem => ({
  name,
  type: "question",
  variable: { type: "nominal", question: name, options: options.map((value) => ({ value })) },
});
const loop = (label: string, children: InLoopItem[]): TopLevelItem =>
  ({ label, type: "unit_loop", children: [{ type: "layout", template: "" }, ...children] }) as TopLevelItem;
const units = (...ids: number[]): FakeUnit[] => ids.map((id) => ({ id }));

const yes = { done: true } as unknown as VariableValue;
const pick = (value: string) => ({ done: true, values: [{ value }] }) as unknown as VariableValue;
const picked = (v: VariableValue | undefined) =>
  (v as { values?: { value: unknown }[] } | undefined)?.values?.[0]?.value;

/** Where the coder is: `q:<name>` (coder-level), `<unitId>:<name>` (in a unit), `finished` or the phase. */
function where(m: StudyManager): string {
  const s = m.getSnapshot();
  if (s.phase === "finished") return "finished";
  if (s.phase === "error") return `error:${s.error}`;
  if (s.phase === "unit_variable") return `${s.currentUnit!.id}:${itemName(s.currentItem!)}`;
  if (s.phase === "user_variable") return `q:${itemName(s.currentItem!)}`;
  return s.phase;
}

/** The answer on screen now. */
function shown(m: StudyManager): unknown {
  const s = m.getSnapshot();
  const name = itemName(s.currentItem!) ?? "";
  return picked(s.phase === "unit_variable" ? s.currentUnitVariables?.[name] : s.userVariableValues[name]);
}

/** Lets saves running in the background finish (as before a reload). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function started(server: FakeCoderServer): Promise<StudyManager> {
  await settle();
  const m = new StudyManager(server, { retryMs: () => 0 });
  await m.start();
  return m;
}

/** Waits until a reload in the background (a new design version) is done. */
async function idle(m: StudyManager): Promise<void> {
  for (let i = 0; i < 50 && m.getSnapshot().phase === "loading"; i++) await settle();
  await settle();
}

/** Answers every question until the coder is at `stop` (or finished): units' questions with "A". */
async function answerUntil(m: StudyManager, stop: string): Promise<void> {
  for (let i = 0; i < 100 && where(m) !== stop && where(m) !== "finished"; i++) {
    await m.answer(m.getSnapshot().phase === "unit_variable" ? pick("A") : yes);
  }
  expect(where(m)).toBe(stop);
}

/** The intro, a loop with two questions per unit (units 1-3), and an outro. */
const basic = () => [confirm("intro"), loop("Coding", [pickQ("q1"), pickQ("q2")]), confirm("outro")];

let server: FakeCoderServer;

// The browser's draft of a unit (localStorage; tests run without a browser), one per test
const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
  key: (i: number) => [...storage.keys()][i] ?? null,
  get length() {
    return storage.size;
  },
} as Storage;
beforeEach(() => storage.clear());

describe("going back and forward", () => {
  beforeEach(() => {
    server = fakeCoderServer({ items: basic(), units: { "1": units(1, 2, 3) } });
  });

  it("goes through the study in order, saving each unit once", async () => {
    const m = await started(server);
    expect(where(m)).toBe("q:intro");
    await m.answer(yes);
    expect(where(m)).toBe("1:q1");
    await m.answer(pick("A"));
    expect(where(m)).toBe("1:q2");
    await m.answer(pick("B"));
    expect(where(m)).toBe("2:q1");
    await answerUntil(m, "q:outro");
    await m.answer(yes);
    expect(where(m)).toBe("finished");
    expect(server.calls.filter((c) => c.startsWith("postUnitVariables"))).toEqual([
      "postUnitVariables:1/1",
      "postUnitVariables:1/2",
      "postUnitVariables:1/3",
    ]);
    expect(picked(server.answers.get("1/1")!.q2)).toBe("B");
    expect(server.ended?.outcome).toBe("complete");
  });

  it("back within a unit and to the previous unit shows the answers given; forward returns to where the coder was", async () => {
    const m = await started(server);
    await m.answer(yes);
    await m.answer(pick("A"));
    await m.answer(pick("B"));
    await m.answer(pick("A")); // unit 2, q1
    expect(where(m)).toBe("2:q2");

    await m.goBack();
    expect(where(m)).toBe("2:q1");
    expect(shown(m)).toBe("A");
    await m.goBack();
    expect(where(m)).toBe("1:q2");
    expect(shown(m)).toBe("B");
    await m.goBack();
    expect(where(m)).toBe("1:q1");

    await m.goForward();
    expect(where(m)).toBe("1:q2");
    await m.goForward();
    expect(where(m)).toBe("2:q1");
    await m.goForward();
    expect(where(m)).toBe("2:q2");
    // Not answered yet: no further
    expect(m.getSnapshot().navigation.canGoForward).toBe(false);
    await m.goForward();
    expect(where(m)).toBe("2:q2");
  });

  it("back from the first unit to the question before the loop, and forward again: the same unit, not the next", async () => {
    const m = await started(server);
    await m.answer(yes);
    await m.answer(pick("A"));
    expect(where(m)).toBe("1:q2");
    await m.goBack();
    await m.goBack();
    expect(where(m)).toBe("q:intro");
    expect(m.getSnapshot().navigation.canGoForward).toBe(true);
    await m.goForward();
    expect(where(m)).toBe("1:q1");
    expect(shown(m)).toBe("A");
    await m.goForward();
    expect(where(m)).toBe("1:q2");
    await answerUntil(m, "q:outro");
    expect(server.done.get("1")).toEqual([1, 2, 3]);
  });

  it("answering the question before the loop again goes back to the unfinished unit", async () => {
    const m = await started(server);
    await m.answer(yes);
    await m.answer(pick("A"));
    await m.answer(pick("A"));
    await m.answer(pick("B")); // unit 2, q1
    await m.jumpToPhase(0);
    expect(where(m)).toBe("q:intro");
    await m.answer(yes);
    expect(where(m)).toBe("2:q2");
    expect(m.getSnapshot().currentUnitVariables?.q1).toBeDefined();
    await answerUntil(m, "q:outro");
    expect(server.done.get("1")).toEqual([1, 2, 3]);
  });

  it("one step back from the question after the loop is the last unit's last question", async () => {
    const m = await started(server);
    await answerUntil(m, "q:outro");
    expect(m.getSnapshot().navigation.canGoBack).toBe(true);
    await m.goBack();
    expect(where(m)).toBe("3:q2");
    await m.goBack();
    expect(where(m)).toBe("3:q1");
    // And forward again to the outro, without saving unit 3 again unless it changed
    await m.goForward();
    await m.goForward();
    expect(where(m)).toBe("q:outro");
    expect(m.getSnapshot().navigation.canGoForward).toBe(false);
  });

  it("forward from a question after the loop does nothing until it is answered", async () => {
    const m = await started(server);
    await answerUntil(m, "q:outro");
    await m.goForward();
    expect(where(m)).toBe("q:outro");
  });

  it("changing an earlier unit's answer saves it again and continues where the coder was", async () => {
    const m = await started(server);
    await m.answer(yes);
    await answerUntil(m, "3:q1");
    await m.jumpToUnit(0);
    expect(where(m)).toBe("1:q1");
    await m.answer(pick("B"));
    expect(where(m)).toBe("1:q2");
    await m.answer(pick("B"));
    // The next unit in the coder's history, then on to where they were
    expect(where(m)).toBe("2:q1");
    expect(picked(server.answers.get("1/1")!.q1)).toBe("B");
    await m.goForward();
    await m.goForward();
    expect(where(m)).toBe("3:q1");
  });

  it("the navigation menu: phases, units and questions", async () => {
    const m = await started(server);
    await m.answer(yes);
    await m.answer(pick("A"));
    await m.answer(pick("A"));
    const nav = m.getSnapshot().navigation;
    expect(nav.currentPhaseIndex).toBe(1);
    expect(nav.phases.map((p) => [p.type, p.isCurrent, p.isCompleted])).toEqual([
      ["question", false, true],
      ["unit_loop", true, false],
      ["question", false, false],
    ]);
    const phase = nav.phases[1];
    expect(phase.totalUnits).toBe(3);
    expect(phase.units?.map((u) => [u.id, u.isCurrent])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(phase.questions?.map((q) => q.name)).toEqual(["q1"]);
  });

  it("jumping to a phase and back to the loop returns to the unit the coder was on", async () => {
    const m = await started(server);
    await m.answer(yes);
    await m.answer(pick("A"));
    await m.answer(pick("A"));
    await m.answer(pick("A")); // unit 2, q2
    await m.jumpToPhase(0);
    expect(where(m)).toBe("q:intro");
    await m.jumpToPhase(1);
    expect(m.getSnapshot().currentUnit?.id).toBe(2);
    // Not ahead of where the coder got
    await m.jumpToPhase(2);
    expect(m.getSnapshot().currentUnit?.id).toBe(2);
  });

  it("jumping to a unit's question: only up to the first unanswered one", async () => {
    const m = await started(server);
    await m.answer(yes);
    expect(where(m)).toBe("1:q1");
    await m.jumpToUnitQuestion(1, 1);
    expect(where(m)).toBe("1:q1");
    await m.answer(pick("A"));
    await m.jumpToUnitQuestion(1, 0);
    expect(where(m)).toBe("1:q1");
    await m.jumpToUnitQuestion(1, 1);
    expect(where(m)).toBe("1:q2");
  });
});

describe("conditions while navigating", () => {
  it("a question a changed answer hides is skipped, and saved as skipped", async () => {
    const items = [
      loop("Coding", [
        pickQ("relevant", ["yes", "no"]),
        {
          type: "branch",
          condition: { script: `$var.relevant.is("yes")` },
          children: [pickQ("topic")],
        } as InLoopItem,
      ]),
    ];
    server = fakeCoderServer({ items, units: { "1": units(1, 2) } });
    const m = await started(server);
    await m.answer(pick("yes"));
    expect(where(m)).toBe("1:topic");
    await m.answer(pick("A"));
    expect(where(m)).toBe("2:relevant");
    await m.goBack();
    await m.goBack();
    expect(where(m)).toBe("1:relevant");
    await m.answer(pick("no"));
    expect(where(m)).toBe("2:relevant");
    expect(server.answers.get("1/1")!.topic).toEqual({ done: true, skip: true });
    // Back from unit 2: unit 1's last shown question is now `relevant`
    await m.goBack();
    expect(where(m)).toBe("1:relevant");
  });

  it("a coder-level answer decides which questions follow", async () => {
    const items = [
      {
        name: "role",
        type: "question",
        variable: { type: "nominal", question: "role", options: [{ value: "a" }, { value: "b" }] },
      },
      { type: "branch", condition: { script: `$var.role.is("a")` }, children: [confirm("only_a")] },
      confirm("last"),
    ] as TopLevelItem[];
    server = fakeCoderServer({ items });
    const m = await started(server);
    await m.answer(pick("a"));
    expect(where(m)).toBe("q:only_a");
    await m.answer(yes);
    await m.goBack();
    await m.goBack();
    expect(where(m)).toBe("q:role");
    await m.answer(pick("b"));
    expect(where(m)).toBe("q:last");
    await m.goBack();
    expect(where(m)).toBe("q:role");
  });
});

describe("loops without units, and several loops", () => {
  it("a loop that has no units for the coder is passed, also going back", async () => {
    server = fakeCoderServer({ items: basic(), units: { "1": [] } });
    const m = await started(server);
    await m.answer(yes);
    expect(where(m)).toBe("q:outro");
    await m.goBack();
    expect(where(m)).toBe("q:intro");
    await m.goForward();
    expect(where(m)).toBe("q:outro");
  });

  it("back from the first unit of a second loop goes to the last unit of the first", async () => {
    const items = [loop("First", [pickQ("a")]), loop("Second", [pickQ("b")])];
    server = fakeCoderServer({ items, units: { "1": units(1, 2), "2": units(10, 11) } });
    const m = await started(server);
    await answerUntil(m, "10:b");
    await m.goBack();
    expect(where(m)).toBe("2:a");
    await m.goForward();
    expect(where(m)).toBe("10:b");
    await answerUntil(m, "finished");
    expect(server.done.get("2")).toEqual([10, 11]);
  });
});

describe("reloads and the end", () => {
  beforeEach(() => {
    server = fakeCoderServer({ items: basic(), units: { "1": units(1, 2, 3) } });
  });

  it("a reload mid-loop continues at the unfinished unit; finished units can be visited with their answers", async () => {
    const first = await started(server);
    await first.answer(yes);
    await first.answer(pick("B"));
    await first.answer(pick("B"));
    await first.answer(pick("A")); // unit 2 q1 answered, not saved (unit unfinished)
    const m = await started(server);
    // The answer to q1 came back from the browser's draft
    expect(where(m)).toBe("2:q2");
    await m.goBack();
    expect(where(m)).toBe("2:q1");
    expect(shown(m)).toBe("A");
    await m.goBack();
    expect(where(m)).toBe("1:q2");
    expect(shown(m)).toBe("B");
    await m.goForward();
    expect(where(m)).toBe("2:q1");
    await answerUntil(m, "q:outro");
    expect(server.done.get("1")).toEqual([1, 2, 3]);
  });

  it("a reload keeps the coder's unit answers given so far (the browser's draft)", async () => {
    const first = await started(server);
    await first.answer(yes);
    await first.answer(pick("B"));
    const m = await started(server);
    expect(where(m)).toBe("1:q2");
    await m.goBack();
    expect(shown(m)).toBe("B");
  });

  it("after the end: reopening lands on the last question; finishing again ends again", async () => {
    const m = await started(server);
    await answerUntil(m, "finished");
    await m.reopen();
    expect(where(m)).toBe("q:outro");
    await m.goBack();
    expect(where(m)).toBe("3:q2");
    await m.goForward();
    await m.answer(yes);
    expect(where(m)).toBe("finished");
  });

  it("a reload after the end shows the end again", async () => {
    const first = await started(server);
    await answerUntil(first, "finished");
    const m = await started(server);
    expect(where(m)).toBe("finished");
    expect(m.getSnapshot().navigation.canGoBack).toBe(false);
  });
});

describe("an end item", () => {
  it("in a loop: the unit is saved, then the session ends; reopening goes back to that unit", async () => {
    const items = [
      loop("Coding", [
        pickQ("ok", ["yes", "no"]),
        {
          type: "branch",
          condition: { script: `$var.ok.is("no")` },
          children: [{ type: "end", name: "stop", message: "Bye" }],
        } as InLoopItem,
      ]),
      confirm("outro"),
    ];
    server = fakeCoderServer({ items, units: { "1": units(1, 2) } });
    const m = await started(server);
    await m.answer(pick("yes"));
    await m.answer(pick("no"));
    expect(where(m)).toBe("finished");
    expect(server.ended).toMatchObject({ item: "stop", unit: { loop: "1", id: 2 } });
    expect(server.done.get("1")).toEqual([1, 2]);
  });
});

describe("quick repeated input (double clicks, fast swipes)", () => {
  beforeEach(() => {
    server = fakeCoderServer({ items: basic(), units: { "1": units(1, 2, 3) } });
  });

  it("a double click on an answer answers the question once", async () => {
    const m = await started(server);
    await m.answer(yes);
    expect(where(m)).toBe("1:q1");
    await Promise.all([m.answer(pick("A")), m.answer(pick("A"))]);
    expect(where(m)).toBe("1:q2");
  });

  it("two quick presses of back go back two steps, in order", async () => {
    const m = await started(server);
    await answerUntil(m, "2:q2");
    await Promise.all([m.goBack(), m.goBack()]);
    expect(where(m)).toBe("1:q2");
    await Promise.all([m.goForward(), m.goForward()]);
    expect(where(m)).toBe("2:q2");
  });

  it("back pressed while an answer is still being handled goes back from where the answer led", async () => {
    const m = await started(server);
    await m.answer(yes);
    await Promise.all([m.answer(pick("B")), m.goBack()]);
    expect(where(m)).toBe("1:q1");
    expect(shown(m)).toBe("B");
  });
});

describe("practice units while navigating", () => {
  const practice = (retry: boolean) => ({ retry, questions: { q1: { key: "A" } } });

  it("a wrong answer shows feedback with the question; with retry, only the right answer goes on", async () => {
    server = fakeCoderServer({
      items: [loop("Coding", [pickQ("q1"), pickQ("q2")])],
      units: { "1": [{ id: 1, practice: practice(true) }, { id: 2 }] },
    });
    const m = await started(server);
    await m.answer(pick("B"));
    expect(where(m)).toBe("1:q1");
    expect(m.getSnapshot().practiceWrong).toMatchObject({ question: "q1", retry: true });
    await m.continueAfterPractice(); // not with retry
    expect(where(m)).toBe("1:q1");
    await m.answer(pick("A"));
    expect(where(m)).toBe("1:q2");
    expect(m.getSnapshot().practiceWrong).toBeNull();
    expect(m.getSnapshot().practiceRight).toBe(1);
    // Back to the solved question and on again: not checked again
    await m.goBack();
    await m.answer(pick("B"));
    expect(where(m)).toBe("1:q2");
  });

  it("without retry, the coder may go on with the wrong answer", async () => {
    server = fakeCoderServer({
      items: [loop("Coding", [pickQ("q1"), pickQ("q2")])],
      units: { "1": [{ id: 1, practice: practice(false) }, { id: 2 }] },
    });
    const m = await started(server);
    await m.answer(pick("B"));
    expect(m.getSnapshot().practiceWrong).toMatchObject({ retry: false });
    await m.continueAfterPractice();
    expect(where(m)).toBe("1:q2");
    await m.answer(pick("A"));
    expect(picked(server.answers.get("1/1")!.q1)).toBe("B");
  });
});

describe("a new design version while coding", () => {
  it("mid-unit: the session loads again, and the coder continues on the same unit with their answers", async () => {
    server = fakeCoderServer({ items: basic(), units: { "1": units(1, 2) } });
    const m = await started(server);
    await m.answer(yes);
    await m.answer(pick("B"));
    expect(where(m)).toBe("1:q2");
    // A third question in the loop
    server.redeploy([confirm("intro"), loop("Coding", [pickQ("q1"), pickQ("q2"), pickQ("q3")]), confirm("outro")]);
    await m.answer(pick("A"));
    await idle(m);
    expect(where(m)).toBe("1:q3");
    await m.goBack();
    await m.goBack();
    expect(where(m)).toBe("1:q1");
    expect(shown(m)).toBe("B");
    await answerUntil(m, "q:outro");
    expect(Object.keys(server.answers.get("1/1")!).sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("a removed question: its answer is dropped; the unsaved unit comes again with the rest", async () => {
    server = fakeCoderServer({ items: basic(), units: { "1": units(1, 2) } });
    const m = await started(server);
    await m.answer(yes);
    await m.answer(pick("A"));
    server.redeploy([confirm("intro"), loop("Coding", [pickQ("q2")]), confirm("outro")]);
    await m.answer(pick("A"));
    await idle(m);
    // Unit 1 wasn't saved: it comes again, its answer kept, to confirm under the new version
    expect(where(m)).toBe("1:q2");
    expect(shown(m)).toBe("A");
    await m.answer(pick("A"));
    expect(where(m)).toBe("2:q2");
    expect(Object.keys(server.answers.get("1/1")!)).toEqual(["q2"]);
  });
});

describe("preview navigation (free)", () => {
  it("next goes ahead without answers, and a unit far ahead can be opened", async () => {
    server = fakeCoderServer({ items: basic(), units: { "1": units(1, 2, 3) } });
    const m = await started(server);
    expect(m.canGoForward(true)).toBe(true);
    await m.goForward(true);
    expect(where(m)).toBe("1:q1");
    await m.goForward(true);
    expect(where(m)).toBe("1:q2");
    await m.jumpToUnit(2, true);
    expect(where(m)).toBe("3:q1");
    expect(m.getSnapshot().navigation.phases[1].units?.map((u) => u.id)).toEqual([1, 2, 3]);
    await m.jumpToPhase(2, true);
    expect(where(m)).toBe("q:outro");
  });
});

describe("end items and quitting", () => {
  const items = () => [
    loop("Coding", [
      pickQ("ok", ["yes", "no"]),
      {
        type: "branch",
        condition: { script: `$var.ok.is("no")` },
        children: [{ type: "end", name: "stop", message: "Bye" }],
      } as InLoopItem,
    ]),
    confirm("outro"),
  ];

  it("reopening after an end in a loop lands on that unit's last question", async () => {
    server = fakeCoderServer({ items: items(), units: { "1": units(1, 2, 3) } });
    const m = await started(server);
    await m.answer(pick("yes"));
    await m.answer(pick("no"));
    expect(where(m)).toBe("finished");
    await m.reopen();
    expect(where(m)).toBe("2:ok");
    await m.answer(pick("yes"));
    expect(where(m)).toBe("3:ok");
  });

  it("quitting ends the session where the coder is; the end stays after a reload", async () => {
    server = fakeCoderServer({ items: basic(), units: { "1": units(1, 2) } });
    const m = await started(server);
    await m.answer(yes);
    await m.quit(false);
    expect(where(m)).toBe("finished");
    expect(m.getSnapshot().quit).toBe(true);
    const again = await started(server);
    expect(where(again)).toBe("finished");
    expect(again.getSnapshot().quit).toBe(true);
  });
});

describe("experiments", () => {
  it("are drawn when reached, never shown, and passed going back", async () => {
    const items = [
      confirm("intro"),
      {
        type: "experiment",
        name: "group",
        variable: { type: "random", draw: "balanced", options: [{ value: "a" }, { value: "b" }] },
      },
      { type: "branch", condition: { script: `$var.group.is("a")` }, children: [confirm("for_a")] },
      confirm("last"),
    ] as TopLevelItem[];
    server = fakeCoderServer({ items });
    const m = await started(server);
    await m.answer(yes);
    expect(where(m)).toBe("q:for_a");
    expect(server.calls).toContain("assignCondition:group");
    await m.goBack();
    expect(where(m)).toBe("q:intro");
    await m.answer(yes);
    expect(where(m)).toBe("q:for_a");
    expect(server.calls.filter((c) => c === "assignCondition:group")).toHaveLength(1);
  });
});
