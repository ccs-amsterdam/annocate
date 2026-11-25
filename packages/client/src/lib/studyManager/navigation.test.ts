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
const loop = (label: string, children: InLoopItem[], id = "loop_1"): TopLevelItem =>
  ({
    label,
    type: "unit_loop",
    id,
    children: [{ type: "layout", template: "" }, ...children],
  }) as TopLevelItem;
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
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
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
      "postUnitVariables:loop_1/1",
      "postUnitVariables:loop_1/2",
      "postUnitVariables:loop_1/3",
    ]);
    expect(picked(server.answers.get("loop_1/1")!.q2)).toBe("B");
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
    expect(server.done.get("loop_1")).toEqual([1, 2, 3]);
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
    expect(server.done.get("loop_1")).toEqual([1, 2, 3]);
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
    expect(picked(server.answers.get("loop_1/1")!.q1)).toBe("B");
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
    await m.jumpToLoopStep(1);
    expect(where(m)).toBe("1:q1");
    await m.answer(pick("A"));
    await m.jumpToLoopStep(0);
    expect(where(m)).toBe("1:q1");
    await m.jumpToLoopStep(1);
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
    server = fakeCoderServer({ items, units: { loop_1: units(1, 2) } });
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
    expect(server.answers.get("loop_1/1")!.topic).toEqual({ done: true, skip: true });
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
    server = fakeCoderServer({ items: basic(), units: { loop_1: [] } });
    const m = await started(server);
    await m.answer(yes);
    expect(where(m)).toBe("q:outro");
    await m.goBack();
    expect(where(m)).toBe("q:intro");
    await m.goForward();
    expect(where(m)).toBe("q:outro");
  });

  it("back from the first unit of a second loop goes to the last unit of the first", async () => {
    const items = [loop("First", [pickQ("a")]), loop("Second", [pickQ("b")], "loop_2")];
    server = fakeCoderServer({ items, units: { loop_1: units(1, 2), loop_2: units(10, 11) } });
    const m = await started(server);
    await answerUntil(m, "10:b");
    await m.goBack();
    expect(where(m)).toBe("2:a");
    await m.goForward();
    expect(where(m)).toBe("10:b");
    await answerUntil(m, "finished");
    expect(server.done.get("loop_2")).toEqual([10, 11]);
  });
});

describe("reloads and the end", () => {
  beforeEach(() => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
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
    expect(server.done.get("loop_1")).toEqual([1, 2, 3]);
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

  it("changing a finished unit's answer keeps the answers to the unit the coder is halfway (a draft per unit)", async () => {
    const first = await started(server);
    await answerUntil(first, "2:q2");
    await first.goBack();
    await first.goBack();
    expect(where(first)).toBe("1:q2");
    await first.answer(pick("B"));
    expect(where(first)).toBe("2:q1");
    const m = await started(server);
    expect(picked(server.answers.get("loop_1/1")!.q2)).toBe("B");
    expect(where(m)).toBe("2:q2");
    await m.goBack();
    expect(shown(m)).toBe("A");
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
    server = fakeCoderServer({ items, units: { loop_1: units(1, 2) } });
    const m = await started(server);
    await m.answer(pick("yes"));
    await m.answer(pick("no"));
    expect(where(m)).toBe("finished");
    expect(server.ended).toMatchObject({ item: "stop", unit: { loop: "loop_1", id: 2 } });
    expect(server.done.get("loop_1")).toEqual([1, 2]);
  });
});

describe("quick repeated input (double clicks, fast swipes)", () => {
  beforeEach(() => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
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
      units: { loop_1: [{ id: 1, practice: practice(true) }, { id: 2 }] },
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

  it("a wrong answer isn't an answer: next and the menu don't pass the question", async () => {
    server = fakeCoderServer({
      items: [loop("Coding", [pickQ("q1"), pickQ("q2")])],
      units: { loop_1: [{ id: 1 }, { id: 2, practice: practice(true) }, { id: 3 }] },
    });
    const m = await started(server);
    await answerUntil(m, "2:q1");
    await m.answer(pick("B"));
    expect(m.getSnapshot().practiceWrong).toMatchObject({ unitId: 2, question: "q1" });
    expect(m.getSnapshot().navigation.canGoForward).toBe(false);
    await m.goForward();
    await m.jumpToLoopStep(1);
    expect(where(m)).toBe("2:q1");
    // Another step: the feedback goes; back on the question, it still has to be answered
    await m.goBack();
    expect(where(m)).toBe("1:q2");
    expect(m.getSnapshot().practiceWrong).toBeNull();
    await m.goForward();
    expect(where(m)).toBe("2:q1");
    expect(m.getSnapshot().practiceWrong).toBeNull();
    expect(m.getSnapshot().navigation.canGoForward).toBe(false);
    expect(m.getSnapshot().navigation.phases[0].questions).toHaveLength(1);
    await m.goForward();
    expect(where(m)).toBe("2:q1");
    await m.answer(pick("A"));
    expect(where(m)).toBe("2:q2");
    await m.answer(pick("A"));
    await settle();
    expect(picked(server.answers.get("loop_1/2")!.q1)).toBe("A");
  });

  it("without retry, next doesn't go on either: the coder goes on from the feedback", async () => {
    server = fakeCoderServer({
      items: [loop("Coding", [pickQ("q1"), pickQ("q2")])],
      units: { loop_1: [{ id: 1, practice: practice(false) }, { id: 2 }] },
    });
    const m = await started(server);
    await m.answer(pick("B"));
    await m.goForward();
    expect(where(m)).toBe("1:q1");
    await m.continueAfterPractice();
    expect(where(m)).toBe("1:q2");
    await m.goBack();
    expect(m.getSnapshot().navigation.canGoForward).toBe(true);
  });

  it("without retry, the coder may go on with the wrong answer", async () => {
    server = fakeCoderServer({
      items: [loop("Coding", [pickQ("q1"), pickQ("q2")])],
      units: { loop_1: [{ id: 1, practice: practice(false) }, { id: 2 }] },
    });
    const m = await started(server);
    await m.answer(pick("B"));
    expect(m.getSnapshot().practiceWrong).toMatchObject({ retry: false });
    await m.continueAfterPractice();
    expect(where(m)).toBe("1:q2");
    await m.answer(pick("A"));
    expect(picked(server.answers.get("loop_1/1")!.q1)).toBe("B");
  });
});

describe("a new design version while coding", () => {
  it("mid-unit: the session loads again, and the coder continues on the same unit with their answers", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2) } });
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
    expect(Object.keys(server.answers.get("loop_1/1")!).sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("a removed question: its answer is dropped; the unsaved unit comes again with the rest", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2) } });
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
    expect(Object.keys(server.answers.get("loop_1/1")!)).toEqual(["q2"]);
  });
});

describe("a new design version while a finished unit is changed", () => {
  const withTitle = () => [confirm("intro"), loop("Coding (new)", [pickQ("q1"), pickQ("q2")]), confirm("outro")];

  it("the change is saved under the new version, and the coder continues where they were", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    const m = await started(server);
    await answerUntil(m, "2:q1");
    await m.goBack();
    expect(where(m)).toBe("1:q2");
    server.redeploy(withTitle());
    await m.answer(pick("B"));
    await idle(m);
    expect(where(m)).toBe("2:q1");
    await settle();
    expect(picked(server.answers.get("loop_1/1")!.q2)).toBe("B");
    expect(picked(server.answers.get("loop_1/1")!.q1)).toBe("A");
  });

  it("the unit the coder is halfway keeps its answers, also without the browser's draft", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    const m = await started(server);
    await answerUntil(m, "2:q2");
    for (let i = 0; i < 3; i++) await m.goBack();
    expect(where(m)).toBe("1:q1");
    storage.clear();
    server.redeploy(withTitle());
    await m.answer(pick("B"));
    await idle(m);
    expect(where(m)).toBe("2:q2");
    await settle();
    expect(picked(server.answers.get("loop_1/1")!.q1)).toBe("B");
    await m.goBack();
    expect(shown(m)).toBe("A");
    // Going back to the changed unit shows the change, not what the server had before
    await m.goBack();
    expect(where(m)).toBe("1:q2");
    await m.goBack();
    expect(shown(m)).toBe("B");
  });
});

describe("answers that build on a span (relations, options from spans)", () => {
  const span = (id: string, text: string) => ({
    id,
    field: "text",
    value: "person",
    slices: [{ offset: 0, length: text.length, text }],
  });
  const spans = (...list: ReturnType<typeof span>[]) => ({ done: true, spans: list }) as unknown as VariableValue;
  const ann = span("s1", "Ann");
  const bob = span("s2", "Bob");
  const knows = {
    done: true,
    relations: [{ id: "r1", fromId: "s1", toId: "s2", value: "knows" }],
  } as unknown as VariableValue;
  const people: InLoopItem = {
    name: "people",
    type: "question",
    variable: { type: "span", question: "people", fields: ["text"], options: [{ value: "person" }] },
  };
  const links: InLoopItem = {
    name: "links",
    type: "question",
    variable: {
      type: "relation",
      question: "links",
      options: [{ value: "knows" }],
      rules: [{ from: { variable: "people" }, to: { variable: "people" } }],
    },
  };
  const main: InLoopItem = {
    name: "main",
    type: "question",
    variable: {
      type: "nominal",
      question: "main",
      options: [{ value: "nobody" }],
      optionsFrom: { from: "$var.people" },
    },
  };
  const texts = (...ids: number[]): FakeUnit[] => ids.map((id) => ({ id, data: { text: "Ann met Bob" } }));
  const errors = (m: StudyManager) => m.getSnapshot().error;

  it("a finished unit: removing a span a relation uses saves the unit without the relation, which is asked again", async () => {
    server = fakeCoderServer({ items: [loop("Coding", [people, links])], units: { loop_1: texts(1, 2) } });
    const m = await started(server);
    await m.answer(spans(ann, bob));
    await m.answer(knows);
    expect(where(m)).toBe("2:people");
    await m.goBack();
    await m.goBack();
    expect(where(m)).toBe("1:people");
    await m.answer(spans(ann));
    await settle();
    expect(errors(m)).toBeNull();
    expect(where(m)).toBe("1:links");
    expect(m.getSnapshot().currentUnitVariables?.links).toBeUndefined();
    expect(server.answers.get("loop_1/1")).toMatchObject({ people: { spans: [ann] }, links: { skip: true } });
    await m.answer({ done: true, relations: [] } as unknown as VariableValue);
    await settle();
    expect(where(m)).toBe("2:people");
    expect(server.answers.get("loop_1/1")!.links).toEqual({ done: true, relations: [] });
  });

  it("a unit the coder is in: the relation is asked again before the unit is saved", async () => {
    server = fakeCoderServer({ items: [loop("Coding", [people, links, pickQ("q3")])], units: { loop_1: texts(1) } });
    const m = await started(server);
    await m.answer(spans(ann, bob));
    await m.answer(knows);
    expect(where(m)).toBe("1:q3");
    await m.goBack();
    await m.goBack();
    await m.answer(spans(bob));
    expect(where(m)).toBe("1:links");
    expect(m.getSnapshot().currentUnitVariables?.links).toBeUndefined();
    // Not past the relation question until it is answered again
    expect(m.getSnapshot().navigation.canGoForward).toBe(false);
    await m.answer({ done: true, relations: [] } as unknown as VariableValue);
    await m.answer(pick("A"));
    await settle();
    expect(errors(m)).toBeNull();
    expect(server.done.get("loop_1")).toEqual([1]);
  });

  it("an answer that is a span (options from spans) is asked again when the span is removed", async () => {
    server = fakeCoderServer({ items: [loop("Coding", [people, main])], units: { loop_1: texts(1, 2) } });
    const m = await started(server);
    await m.answer(spans(ann, bob));
    await m.answer(pick("s2"));
    expect(where(m)).toBe("2:people");
    expect(picked(server.answers.get("loop_1/1")!.main)).toBe("s2");
    await m.goBack();
    await m.goBack();
    await m.answer(spans(ann));
    await settle();
    expect(errors(m)).toBeNull();
    expect(where(m)).toBe("1:main");
    expect(shown(m)).toBeUndefined();
    await m.answer(pick("s1"));
    await settle();
    expect(picked(server.answers.get("loop_1/1")!.main)).toBe("s1");
  });

  it("a reload: an answer whose span is gone is asked again", async () => {
    server = fakeCoderServer({ items: [loop("Coding", [people, links, pickQ("q3")])], units: { loop_1: texts(1) } });
    const first = await started(server);
    await first.answer(spans(ann, bob));
    await first.answer(knows);
    // The browser's draft, with a relation to a span that isn't there
    const [key, draft] = [...storage][0];
    storage.set(key, draft.replace('"toId":"s2"', '"toId":"gone"'));
    const m = await started(server);
    expect(where(m)).toBe("1:links");
  });
});

describe("answers the server refuses", () => {
  it("a coder-level answer to a question a new design version removed isn't posted any more", async () => {
    server = fakeCoderServer({ items: [confirm("old"), confirm("c2"), confirm("c3")] });
    const first = await started(server);
    await first.answer(yes);
    await settle();
    server.redeploy([confirm("c2"), confirm("c3")]);
    const m = await started(server);
    expect(where(m)).toBe("q:c2");
    await m.answer(yes);
    await settle();
    expect(where(m)).toBe("q:c3");
    expect(server.coder.c2).toBeDefined();
  });

  it("a coder-level answer that no longer fits isn't posted with the others", async () => {
    const role = (...values: string[]): TopLevelItem =>
      ({
        name: "role",
        type: "question",
        variable: { type: "nominal", question: "role", options: values.map((value) => ({ value })) },
      }) as TopLevelItem;
    server = fakeCoderServer({ items: [confirm("c1"), role("a", "b"), confirm("c3")] });
    const first = await started(server);
    await first.answer(yes);
    await first.answer(pick("a"));
    await settle();
    server.redeploy([confirm("c1"), role("b", "c"), confirm("c3")]);
    const m = await started(server);
    expect(where(m)).toBe("q:role");
    // The coder changes an earlier answer first: saved, without the answer that doesn't fit
    await m.goBack();
    await m.answer(yes);
    await settle();
    expect(where(m)).toBe("q:role");
    await m.answer(pick("c"));
    await settle();
    expect(picked(server.coder.role)).toBe("c");
  });

  it("a unit the server refuses (400): the coder can go back to it, answer again, and it is saved", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    const m = await started(server);
    await answerUntil(m, "1:q2");
    server.fail("postUnitVariables");
    await m.answer(pick("A"));
    await settle();
    expect(m.getSnapshot()).toMatchObject({ phase: "error", refusedUnit: { loop: "loop_1", unitId: 1 } });
    await m.backToRefusedUnit();
    expect(where(m)).toBe("1:q2");
    expect(m.getSnapshot().unsaved).toBe(0);
    await m.answer(pick("B"));
    await settle();
    expect(where(m)).toBe("2:q1");
    expect(picked(server.answers.get("loop_1/1")!.q2)).toBe("B");
    expect(server.done.get("loop_1")).toEqual([1]);
  });

  it("a refused unit: retry sends it again; an error that isn't a refused unit offers no unit", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    const m = await started(server);
    server.fail("getNextUnits");
    await m.answer(yes);
    expect(m.getSnapshot()).toMatchObject({ phase: "error", refusedUnit: null });
    await m.retry();
    await answerUntil(m, "1:q2");
    server.fail("postUnitVariables");
    await m.answer(pick("A"));
    await settle();
    expect(m.getSnapshot().refusedUnit).toEqual({ loop: "loop_1", unitId: 1 });
    await m.retry();
    await settle();
    expect(where(m)).toBe("2:q1");
    expect(server.done.get("loop_1")).toEqual([1]);
  });
});

describe("finished units that weren't sent when the page closed", () => {
  /** Whether the first visit has a connection for saving units. */
  let online: boolean;
  /** A visit whose unit posts don't arrive while there is no connection. */
  const visit = async () => {
    const m = new StudyManager(
      {
        ...server,
        postUnitVariables: async (...post: Parameters<FakeCoderServer["postUnitVariables"]>) => {
          // (Sent, and never answered: the page is closed before it is)
          if (!online) return new Promise<void>(() => {});
          return server.postUnitVariables(...post);
        },
      },
      { retryMs: () => 0 },
    );
    await m.start();
    return m;
  };
  beforeEach(() => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    online = false;
  });

  it("are sent when the coder comes back, who then continues after them", async () => {
    const first = await visit();
    await answerUntil(first, "3:q1");
    expect(first.getSnapshot()).toMatchObject({ unsaved: 2, unsavedUnits: 2 });
    expect(server.done.get("loop_1")).toBeUndefined();

    const m = await started(server);
    expect(server.done.get("loop_1")).toEqual([1, 2]);
    expect(picked(server.answers.get("loop_1/2")!.q2)).toBe("A");
    expect(where(m)).toBe("3:q1");
    expect(m.getSnapshot().unsaved).toBe(0);
    await m.goBack();
    expect(where(m)).toBe("2:q2");
    // Sent: not sent again by a later visit
    const posts = server.calls.filter((c) => c.startsWith("postUnitVariables")).length;
    await started(server);
    expect(server.calls.filter((c) => c.startsWith("postUnitVariables"))).toHaveLength(posts);
  });

  it("one the server doesn't take any more comes again with its answers", async () => {
    const first = await visit();
    await answerUntil(first, "2:q1");

    server.fail("postUnitVariables");
    const m = await started(server);
    expect(m.getSnapshot().phase).not.toBe("error");
    expect(where(m)).toBe("1:q2");
    expect(shown(m)).toBe("A");
    await m.answer(pick("B"));
    await settle();
    expect(picked(server.answers.get("loop_1/1")!.q2)).toBe("B");
    expect(where(m)).toBe("2:q1");
  });

  it("without a connection at the start: the start fails, and retry sends them", async () => {
    const first = await visit();
    await answerUntil(first, "2:q1");

    server.fail("postUnitVariables", new TypeError("Failed to fetch"));
    const m = await started(server);
    expect(m.getSnapshot().phase).toBe("error");
    await m.retry();
    expect(where(m)).toBe("2:q1");
    expect(server.done.get("loop_1")).toEqual([1]);
  });
});

describe("a coding screen that is gone (dispose)", () => {
  it("stops trying to save; starting again goes on with the same session", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    let online = false;
    let attempts = 0;
    const m = new StudyManager(
      {
        ...server,
        postUnitVariables: async (...post: Parameters<FakeCoderServer["postUnitVariables"]>) => {
          attempts += 1;
          if (!online) throw new TypeError("Failed to fetch");
          return server.postUnitVariables(...post);
        },
      },
      { retryMs: () => 1 },
    );
    await m.start();
    await answerUntil(m, "2:q1");
    m.dispose();
    await settle();
    const tried = attempts;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(attempts).toBe(tried);
    expect(server.done.get("loop_1")).toBeUndefined();

    // (React StrictMode: the screen is mounted again)
    online = true;
    await m.start();
    await settle();
    await settle();
    expect(server.done.get("loop_1")).toEqual([1]);
    expect(where(m)).toBe("2:q1");
    expect(server.calls.filter((c) => c === "getSession")).toHaveLength(1);
  });
});

describe("the server ends the session (gold checks) while the coder goes on", () => {
  it("the ending comes after the step the coder was taking, which is taken whole", async () => {
    const end = { type: "end", name: "low_quality" } as TopLevelItem;
    server = fakeCoderServer({ items: [loop("Coding", [pickQ("q1")]), end], units: { loop_1: units(1, 2, 3) } });
    const m = new StudyManager(
      {
        ...server,
        postUnitVariables: async (...post: Parameters<FakeCoderServer["postUnitVariables"]>) => {
          await server.postUnitVariables(...post);
          return { end: "low_quality" };
        },
      },
      { retryMs: () => 0 },
    );
    await m.start();
    const seen: string[] = [];
    m.subscribe(() => {
      if (seen.at(-1) !== where(m)) seen.push(where(m));
    });
    await m.answer(pick("A"));
    await settle();
    expect(seen).toEqual(["1:q1", "2:q1", "finished"]);
    expect(m.getSnapshot().ending?.item.name).toBe("low_quality");
    expect(m.getSnapshot().navigation.currentUnitIndex).toBeUndefined();
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
    server = fakeCoderServer({ items: items(), units: { loop_1: units(1, 2, 3) } });
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
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2) } });
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
        variable: { type: "experiment", draw: "balanced", options: [{ value: "a" }, { value: "b" }] },
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

describe("a failed request, and retry", () => {
  const count = (call: string) => server.calls.filter((c) => c.startsWith(call)).length;
  /** A manager that asks for one unit at a time (so each next unit is a request). */
  const startedUnitByUnit = async () => {
    const m = new StudyManager(
      { ...server, getNextUnits: (key: string) => server.getNextUnits(key, 1) },
      { retryMs: () => 0 },
    );
    await m.start();
    return m;
  };
  const endInLoop = () => [
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

  it("drawing an experiment's condition: retry draws it, and the coder gets the questions for it", async () => {
    const items = [
      confirm("intro"),
      {
        type: "experiment",
        name: "group",
        variable: { type: "experiment", draw: "balanced", options: [{ value: "a" }, { value: "b" }] },
      },
      { type: "branch", condition: { script: `$var.group.is("a")` }, children: [confirm("for_a")] },
      confirm("last"),
    ] as TopLevelItem[];
    server = fakeCoderServer({ items });
    const m = await started(server);
    server.fail("assignCondition");
    await m.answer(yes);
    expect(m.getSnapshot().phase).toBe("error");
    await m.retry();
    expect(where(m)).toBe("q:for_a");
    expect(count("assignCondition:group")).toBe(2);
    expect(count("postCoderVariables")).toBe(1);
  });

  it("ending the session: retry ends it", async () => {
    server = fakeCoderServer({ items: [confirm("intro")] });
    const m = await started(server);
    server.fail("endSession");
    await m.answer(yes);
    expect(m.getSnapshot().phase).toBe("error");
    expect(server.ended).toBeNull();
    await m.retry();
    expect(where(m)).toBe("finished");
    expect(server.ended?.outcome).toBe("complete");
    expect(count("postCoderVariables")).toBe(1);
  });

  it("an end item in a loop: retry ends the session on that unit, not on the next", async () => {
    server = fakeCoderServer({ items: endInLoop(), units: { loop_1: units(1, 2, 3) } });
    const m = await started(server);
    await m.answer(pick("yes"));
    server.fail("endSession");
    await m.answer(pick("no"));
    expect(m.getSnapshot().phase).toBe("error");
    await m.retry();
    expect(where(m)).toBe("finished");
    expect(server.ended).toMatchObject({ item: "stop", unit: { loop: "loop_1", id: 2 } });
    expect(count("postUnitVariables:loop_1/2")).toBe(1);
    expect(server.done.get("loop_1")).toEqual([1, 2]);
  });

  it("the first units of a loop: retry enters the loop", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    const m = await started(server);
    server.fail("getNextUnits");
    await m.answer(yes);
    expect(m.getSnapshot().phase).toBe("error");
    await m.retry();
    expect(where(m)).toBe("1:q1");
    await m.goBack();
    expect(where(m)).toBe("q:intro");
    expect(count("postCoderVariables")).toBe(1);
  });

  it("the next unit after a finished one: retry gets it, and the finished unit is saved once", async () => {
    server = fakeCoderServer({ items: [loop("Coding", [pickQ("q1")])], units: { loop_1: units(1, 2) } });
    const m = await startedUnitByUnit();
    server.fail("getNextUnits");
    await m.answer(pick("A"));
    expect(m.getSnapshot().phase).toBe("error");
    await m.retry();
    expect(where(m)).toBe("2:q1");
    expect(count("postUnitVariables:loop_1/1")).toBe(1);
  });

  it("going back to a unit of an earlier visit: retry goes back, from where the coder was", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    await answerUntil(await started(server), "2:q2");
    const m = await started(server);
    await m.goBack();
    expect(where(m)).toBe("2:q1");
    server.fail("getLoopUnit");
    await m.goBack();
    expect(m.getSnapshot().phase).toBe("error");
    await m.retry();
    expect(where(m)).toBe("1:q2");
    expect(count("getLoopUnit:loop_1/1")).toBe(2);
    await m.goForward();
    expect(where(m)).toBe("2:q1");
  });

  it("jumping to a unit of an earlier visit: retry jumps", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    await answerUntil(await started(server), "2:q2");
    const m = await started(server);
    server.fail("getLoopUnit");
    await m.jumpToUnit(0);
    expect(m.getSnapshot().phase).toBe("error");
    expect(m.getSnapshot().navigation.currentUnitIndex).toBe(1);
    await m.retry();
    expect(where(m)).toBe("1:q1");
  });

  it("jumping to a loop: the coder stays where they were, and retry jumps", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    await answerUntil(await started(server), "q:outro");
    const m = await started(server);
    expect(where(m)).toBe("q:outro");
    server.fail("getNextUnits");
    await m.jumpToPhase(1);
    expect(m.getSnapshot().phase).toBe("error");
    expect(m.getSnapshot().navigation.currentPhaseIndex).toBe(2);
    await m.retry();
    expect(m.getSnapshot().phase).not.toBe("error");
    await m.jumpToPhase(2);
    await m.goBack();
    expect(where(m)).toBe("3:q2");
  });

  it("a request that fails again can be retried again", async () => {
    server = fakeCoderServer({ items: basic(), units: { loop_1: units(1, 2, 3) } });
    const m = await started(server);
    server.fail("getNextUnits");
    await m.answer(yes);
    server.fail("getNextUnits");
    await m.retry();
    expect(m.getSnapshot().phase).toBe("error");
    await m.retry();
    expect(where(m)).toBe("1:q1");
  });

  it("next never goes past the last step after a changed answer hid earlier ones", async () => {
    const items = [
      {
        name: "q1",
        type: "question",
        variable: { type: "nominal", question: "q1", options: [{ value: "a" }, { value: "b" }] },
      },
      { type: "branch", condition: { script: `$var.q1.is("a")` }, children: [confirm("q2"), confirm("q3")] },
      confirm("q4"),
      confirm("q5"),
    ] as TopLevelItem[];
    server = fakeCoderServer({ items });
    const m = await started(server);
    await m.answer(pick("a"));
    await answerUntil(m, "q:q5");
    for (let i = 0; i < 4; i++) await m.goBack();
    expect(where(m)).toBe("q:q1");
    await m.answer(pick("b"));
    expect(where(m)).toBe("q:q4");
    await m.goForward();
    expect(where(m)).toBe("q:q5");
    expect(m.getSnapshot().navigation.canGoForward).toBe(false);
    await m.goForward();
    expect(where(m)).toBe("q:q5");
    // The hidden questions shown again: the coder still reached the last one
    await m.goBack();
    await m.goBack();
    await m.answer(pick("a"));
    expect(where(m)).toBe("q:q2");
    expect(m.getSnapshot().navigation.maxReachedTopIndex).toBe(4);
  });
});
