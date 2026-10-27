import type {
  TopLevelItem,
  InLoopItem,
  CoderUnitResponse,
  SessionResponse,
  VariableValue,
  UserVariableItem,
  UnitVariableItem,
  UnitLoopItem,
} from "@annotinder/contracts";
import { itemName } from "@annotinder/contracts";
import { describe, expect, it, vi } from "vitest";

import type { CoderApi } from "../api/httpCoderApi";
import { JobManager } from "./JobManager";

function confirm(name: string): UserVariableItem {
  return { name, type: "user_variable", variable: { type: "confirm", question: "?" } };
}

function unitLoop(name: string, children: InLoopItem[], unitset = "__all__"): UnitLoopItem {
  return { name, type: "unit_loop", units: [{ mode: "all", unitset }], layout: { template: "" }, children };
}

function unitVar(name: string): UnitVariableItem {
  return {
    name,
    type: "unit_variable",
    variable: { type: "nominal", question: "?", options: [{ value: "A" }, { value: "B" }] },
  };
}

function session(items: TopLevelItem[]): SessionResponse {
  return {
    codebook: { id: 1, note: null, items, immutable: false, created: new Date() } as SessionResponse["codebook"],
    progress: [],
  } as unknown as SessionResponse;
}

function unit(id: number): CoderUnitResponse {
  return { id, data: {}, variables: {} } as CoderUnitResponse;
}

/** A stub CoderApi whose methods can be individually made to reject once, then succeed. */
function makeFlakyServer(overrides: Partial<CoderApi> = {}): CoderApi & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const base: CoderApi = {
    getSession: vi.fn(async () => {
      calls.getSession = (calls.getSession ?? 0) + 1;
      return session([confirm("consent")]);
    }),
    getNextUnit: vi.fn(async () => {
      calls.getNextUnit = (calls.getNextUnit ?? 0) + 1;
      return null;
    }),
    getLoopUnit: vi.fn(async (_loop: string, id: number) => unit(id)),
    postUnitVariables: vi.fn(async () => {
      calls.postUnitVariables = (calls.postUnitVariables ?? 0) + 1;
    }),
    postCoderVariables: vi.fn(async () => {
      calls.postCoderVariables = (calls.postCoderVariables ?? 0) + 1;
    }),
    endSession: vi.fn(async () => {
      calls.endSession = (calls.endSession ?? 0) + 1;
    }),
  };
  return Object.assign(base, overrides, { calls });
}

describe("JobManager error-handling, rollback, and retry contract", () => {
  it("a failed user_variable answer can be retried and still advances correctly afterwards", async () => {
    let failNext = true;
    const postCoderVariables = vi.fn(async (vars: Record<string, VariableValue>) => {
      void vars;
      if (failNext) {
        failNext = false;
        throw new Error("timeout");
      }
    });
    const server = makeFlakyServer({ postCoderVariables });
    const manager = new JobManager(server);
    await manager.start();
    expect(manager.getSnapshot().phase).toBe("user_variable");

    await manager.answer({ value: true } as unknown as VariableValue);
    expect(manager.getSnapshot().phase).toBe("error");
    expect(postCoderVariables).toHaveBeenCalledTimes(1);

    await manager.retry();
    expect(postCoderVariables).toHaveBeenCalledTimes(2);
    expect(postCoderVariables.mock.calls[0][0]).toEqual(postCoderVariables.mock.calls[1][0]);
    expect(manager.getSnapshot().phase).toBe("finished");
  });

  it("retry() is a no-op when nothing has failed", async () => {
    const server = makeFlakyServer();
    const manager = new JobManager(server);
    await manager.start();
    await expect(manager.retry()).resolves.toBeUndefined();
    expect(manager.getSnapshot().phase).toBe("user_variable");
  });

  it("a failed unit_variable answer can be retried and still advances correctly afterwards", async () => {
    let failNext = true;
    const postUnitVariables = vi.fn(async () => {
      if (failNext) {
        failNext = false;
        throw new Error("server 500");
      }
    });
    let unitsServed = 0;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session([unitLoop("loop", [unitVar("sentiment")])])),
      getNextUnit: vi.fn(async () => {
        unitsServed += 1;
        return unitsServed === 1 ? unit(1) : null;
      }),
      postUnitVariables,
    });
    const manager = new JobManager(server);
    await manager.start();
    expect(manager.getSnapshot().phase).toBe("unit_variable");
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("sentiment");

    await manager.answer({ values: [{ value: "A" }] } as unknown as VariableValue);
    expect(manager.getSnapshot().phase).toBe("error");

    await manager.retry();
    expect(postUnitVariables).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot().phase).toBe("finished");
  });

  it("skips auto variables and uses their server-assigned values in conditions", async () => {
    const items = [
      { type: "question", name: "group", variable: { type: "auto", source: "balanced", options: [{ value: "a" }, { value: "b" }] } },
      { type: "condition", condition: { script: `$var.group.is("a")` }, children: [confirm("shown_to_a")] },
      confirm("everyone"),
    ] as TopLevelItem[];
    const server = makeFlakyServer({
      getSession: vi.fn(async () => ({
        ...session(items),
        variables: { group: { done: true, skip: false, values: [{ value: "a" }] } },
      })),
    });
    const manager = new JobManager(server);
    await manager.start();
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("shown_to_a");
  });

  it("asks the server for the next unit by loop name", async () => {
    let unitsServed = 0;
    const getNextUnit = vi.fn(async (loop: string) => {
      expect(loop).toBe("loop_all_units");
      unitsServed += 1;
      return unitsServed === 1 ? unit(10) : null;
    });
    const postUnitVariables = vi.fn(async () => {});
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session([unitLoop("loop_all_units", [unitVar("q1")])])),
      getNextUnit,
      postUnitVariables,
    });
    const manager = new JobManager(server);
    await manager.start();
    expect(getNextUnit).toHaveBeenCalledWith("loop_all_units", { branch: 0, unitsets: ["__all__"] });
    expect(manager.getSnapshot().phase).toBe("unit_variable");
    expect(manager.getSnapshot().currentUnit?.id).toBe(10);
  });
});

describe("JobManager navigation, backwards navigation, and answer re-editing", () => {
  it("allows going back within questions of the same unit", async () => {
    let unitsServed = 0;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session([unitLoop("loop", [unitVar("q1"), unitVar("q2")])])),
      getNextUnit: vi.fn(async () => {
        unitsServed += 1;
        return unitsServed === 1 ? unit(1) : null;
      }),
    });
    const manager = new JobManager(server);
    await manager.start();

    expect(itemName(manager.getSnapshot().currentItem!)).toBe("q1");
    expect(manager.getSnapshot().navigation.canGoBack).toBe(false);

    // Answer first question
    await manager.answer({ values: [{ value: "A" }] } as unknown as VariableValue);
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("q2");
    expect(manager.getSnapshot().navigation.canGoBack).toBe(true);

    // Go back to first question
    await manager.goBack();
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("q1");
    expect(manager.getSnapshot().currentUnitVariables?.q1).toBeDefined();

    // Can go forward to second question
    expect(manager.getSnapshot().navigation.canGoForward).toBe(true);
    await manager.goForward();
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("q2");
  });

  it("allows going back to a previously coded unit, retaining and re-submitting answers", async () => {
    let unitsServed = 0;
    const postedUnits: Record<number, Record<string, VariableValue>> = {};
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session([unitLoop("loop", [unitVar("sentiment")])])),
      getNextUnit: vi.fn(async () => {
        unitsServed += 1;
        if (unitsServed === 1) return unit(101);
        if (unitsServed === 2) return unit(102);
        return null;
      }),
      postUnitVariables: vi.fn(async (unitId, vars) => {
        postedUnits[unitId] = vars;
      }),
    });

    const manager = new JobManager(server);
    await manager.start();

    // Unit 101
    expect(manager.getSnapshot().currentUnit?.id).toBe(101);
    expect(manager.getSnapshot().navigation.canGoBack).toBe(false);
    await manager.answer({ values: [{ value: "A" }] } as unknown as VariableValue);

    // Unit 102
    expect(manager.getSnapshot().currentUnit?.id).toBe(102);
    expect(manager.getSnapshot().navigation.canGoBack).toBe(true);
    expect(postedUnits[101]).toBeDefined();

    // Go back to Unit 101
    await manager.goBack();
    expect(manager.getSnapshot().currentUnit?.id).toBe(101);
    expect(manager.getSnapshot().currentUnitVariables?.sentiment).toEqual({ values: [{ value: "A" }], done: true });

    // Modify answer for Unit 101 and re-submit
    await manager.answer({ values: [{ value: "B" }] } as unknown as VariableValue);

    // Should now automatically advance to Unit 102 from history!
    expect(manager.getSnapshot().currentUnit?.id).toBe(102);
    expect(postedUnits[101].sentiment).toEqual({ values: [{ value: "B" }], done: true });
  });

  it("supports jumping directly to previous units via jumpToUnit", async () => {
    let unitsServed = 0;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session([unitLoop("loop", [unitVar("rating")])])),
      getNextUnit: vi.fn(async () => {
        unitsServed += 1;
        if (unitsServed <= 3) return unit(unitsServed);
        return null;
      }),
    });

    const manager = new JobManager(server);
    await manager.start();

    // Answer unit 1
    await manager.answer({ values: [{ value: "A" }] } as unknown as VariableValue);
    // Answer unit 2
    await manager.answer({ values: [{ value: "B" }] } as unknown as VariableValue);
    // Now on unit 3
    expect(manager.getSnapshot().currentUnit?.id).toBe(3);
    expect(manager.getSnapshot().navigation.totalUnitsInHistory).toBe(3);

    // Jump directly to unit index 0 (unit id 1)
    await manager.jumpToUnit(0);
    expect(manager.getSnapshot().currentUnit?.id).toBe(1);
    expect(manager.getSnapshot().currentUnitVariables?.rating).toEqual({ values: [{ value: "A" }], done: true });
  });

  it("supports jumping to different phases via jumpToPhase", async () => {
    let unitsServed = 0;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session([confirm("consent"), unitLoop("loop", [unitVar("q")])])),
      getNextUnit: vi.fn(async () => {
        unitsServed += 1;
        return unitsServed === 1 ? unit(1) : null;
      }),
    });

    const manager = new JobManager(server);
    await manager.start();

    expect(manager.getSnapshot().phase).toBe("user_variable");
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("consent");

    await manager.answer({ value: true } as unknown as VariableValue);
    expect(manager.getSnapshot().phase).toBe("unit_variable");

    // Jump back to consent phase (phase index 0)
    await manager.jumpToPhase(0);
    expect(manager.getSnapshot().phase).toBe("user_variable");
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("consent");

    // Jump forward to unit loop phase (phase index 1)
    await manager.jumpToPhase(1);
    expect(manager.getSnapshot().phase).toBe("unit_variable");
    expect(manager.getSnapshot().currentUnit?.id).toBe(1);
  });
});

describe("resuming a session", () => {
  const code = (c: string) => ({ done: true, skip: false, values: [{ value: c }] });
  const select = (name: string, codes: string[]) =>
    ({ type: "question", name, variable: { type: "nominal", question: name, options: codes.map((c) => ({ value: c })) } }) as InLoopItem;
  const unitWith = (id: number, variables: Record<string, unknown>) =>
    ({ id, externalId: `u${id}`, data: {}, variables }) as unknown as CoderUnitResponse;

  function resumedServer(opts: { variables?: Record<string, unknown>; nextUnit?: CoderUnitResponse | null; items?: TopLevelItem[] }) {
    const getLoopUnit = vi.fn(async (_loop: string, id: number) => unitWith(id, { q1: code("a"), q2: code("x") }));
    let served = false;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => ({
        ...session(opts.items ?? [confirm("consent"), unitLoop("main", [select("q1", ["a", "b"]), select("q2", ["x", "y"])])]),
        variables: opts.variables ?? { consent: { done: true, skip: false } },
        progress: [{ unitset: "main", doneUnitIds: [10, 11], totalUnits: 5 }],
      }) as SessionResponse),
      getNextUnit: vi.fn(async () => {
        if (served) return null;
        served = true;
        return opts.nextUnit === undefined ? unitWith(12, {}) : opts.nextUnit;
      }),
      getLoopUnit,
    });
    return { server, getLoopUnit };
  }

  it("skips answered questions and finished units, and can go back to them", async () => {
    const { server, getLoopUnit } = resumedServer({});
    const manager = new JobManager(server);
    await manager.start();

    const snap = manager.getSnapshot();
    expect(snap.currentUnit?.id).toBe(12);
    expect(itemName(snap.currentItem!)).toBe("q1");
    const loopPhase = snap.navigation.phases.find((p) => p.type === "unit_loop")!;
    expect(loopPhase).toMatchObject({ unitCount: 3, totalUnits: 5, currentUnitIndex: 2 });
    expect(getLoopUnit).not.toHaveBeenCalled();
    expect(snap.navigation.canGoBack).toBe(true);

    await manager.goBack(); // to the last question of unit 11, loaded on demand
    expect(getLoopUnit).toHaveBeenCalledWith("main", 11);
    expect(manager.getSnapshot().currentUnit?.id).toBe(11);
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("q2");
  });

  it("asks again when a stored answer no longer fits the codebook", async () => {
    const items = [select("group", ["a", "b"]) as unknown as TopLevelItem, unitLoop("main", [select("q1", ["a"])])];
    const { server } = resumedServer({ items, variables: { group: code("removed_code") } });
    const manager = new JobManager(server);
    await manager.start();
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("group");
  });

  it("starts a partly answered unit at its first open question, dropping invalid answers", async () => {
    const partly = resumedServer({ nextUnit: unitWith(12, { q1: code("a") }) });
    const m1 = new JobManager(partly.server);
    await m1.start();
    expect(itemName(m1.getSnapshot().currentItem!)).toBe("q2");

    const changed = resumedServer({ nextUnit: unitWith(12, { q1: code("gone"), q2: code("x") }) });
    const m2 = new JobManager(changed.server);
    await m2.start();
    expect(itemName(m2.getSnapshot().currentItem!)).toBe("q1");
    expect(m2.getSnapshot().currentUnitVariables).not.toHaveProperty("q1");
  });
});

describe("submitting a finished unit", () => {
  it("posts every question of the loop, with skip for those a condition hid", async () => {
    const hidden = { type: "condition", condition: { script: "false" }, children: [unitVar("q2")] } as InLoopItem;
    const postUnitVariables = vi.fn(async () => {});
    let served = false;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session([unitLoop("main", [unitVar("q1"), hidden])])),
      getNextUnit: vi.fn(async () => (served ? null : ((served = true), unit(5)))),
      postUnitVariables,
    });
    const manager = new JobManager(server);
    await manager.start();
    await manager.answer({ done: true, skip: false });

    expect(postUnitVariables).toHaveBeenCalledWith(
      5,
      { q1: { done: true, skip: false }, q2: { done: true, skip: true } },
      "main",
    );
  });
});

describe("choosing a unit loop branch", () => {
  const slot = { type: "question", name: "slot", variable: { type: "auto", source: "invite", options: [{ value: "1" }, { value: "2" }] } };
  const role = {
    type: "question",
    name: "role",
    variable: { type: "nominal", question: "Role?", options: [{ value: "student" }, { value: "expert" }] },
  };
  const loop = {
    type: "unit_loop",
    name: "main",
    units: [
      { when: { script: `$var.role.is("expert")` }, mode: "all", unitset: "hard" },
      { when: { script: "$var.slot.value === '2'" }, mode: "all", unitset: "part_$var.slot.value", overlap: { unitset: "overlap" } },
      { when: { script: "$var.slot.value === '3'" }, mode: "sets", unitsets: ["s1", "s2"], overlap: { unitset: "overlap" } },
      { mode: "all", unitset: "fallback" },
    ],
    layout: { template: "" },
    children: [unitVar("q1")],
  };

  async function start(answers: Record<string, VariableValue>, getNextUnit = vi.fn(async () => null)) {
    const server = makeFlakyServer({
      getSession: vi.fn(async () => ({ ...session([slot, role, loop] as TopLevelItem[]), variables: answers })),
      getNextUnit,
    });
    const manager = new JobManager(server);
    await manager.start();
    return { manager, getNextUnit };
  }
  const code = (c: string): VariableValue => ({ done: true, skip: false, values: [{ value: c }] });

  it("sends the first matching branch and its filled-in unitset names", async () => {
    const { getNextUnit } = await start({ slot: code("2"), role: code("student") });
    expect(getNextUnit).toHaveBeenCalledWith("main", { branch: 1, unitsets: ["part_2", "overlap"] });
    // In `sets` mode the server picks the set: sent empty.
    const sets = await start({ slot: code("3"), role: code("student") });
    expect(sets.getNextUnit).toHaveBeenCalledWith("main", { branch: 2, unitsets: ["", "overlap"] });

    const expert = await start({ slot: code("2"), role: code("expert") });
    expect(expert.getNextUnit).toHaveBeenCalledWith("main", { branch: 0, unitsets: ["hard"] });

    const other = await start({ slot: code("1"), role: code("student") });
    expect(other.getNextUnit).toHaveBeenCalledWith("main", { branch: 3, unitsets: ["fallback"] });
  });

  it("treats branch_required as no units when no branch matches", async () => {
    const noFallback = { ...loop, units: loop.units.slice(0, 1) };
    const getNextUnit = vi.fn(async () => {
      throw Object.assign(new Error("branch required"), { code: "branch_required" });
    });
    const server = makeFlakyServer({
      getSession: vi.fn(async () => ({ ...session([slot, role, noFallback] as TopLevelItem[]), variables: { role: code("student") } })),
      getNextUnit,
    });
    const manager = new JobManager(server);
    await manager.start();
    expect(getNextUnit).toHaveBeenCalledWith("main", undefined);
    expect(manager.getSnapshot().phase).toBe("finished");
  });
});

describe("rendering templates", () => {
  it("fills in question texts and the layout from answers and unit data", async () => {
    const items = [
      { type: "question", name: "role", variable: { type: "nominal", question: "Role?", options: [{ value: "student" }] } },
      {
        type: "unit_loop",
        name: "main",
        units: [{ mode: "all", unitset: "__all__" }],
        layout: { template: "# $unit.title\n\n$const.intro", constants: { intro: "Hello" } },
        children: [
          { type: "question", name: "q1", variable: { type: "confirm", question: "As a $var.role.value, is **$unit.title** news?" } },
        ],
      },
    ] as TopLevelItem[];
    let served = false;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => ({ ...session(items), variables: { role: { done: true, skip: false, values: [{ value: "student" }] } } })),
      getNextUnit: vi.fn(async () => (served ? null : ((served = true), { id: 1, externalId: "u1", data: { title: "*Big*" }, variables: {} } as CoderUnitResponse))),
    });
    const manager = new JobManager(server);
    await manager.start();
    const snap = manager.getSnapshot();
    expect(snap.currentUnitTemplate?.values.map((v) => v.text)).toEqual(["*Big*", "Hello"]);
    expect(snap.currentTexts?.question?.values.map((v) => v.text)).toEqual(["student", "*Big*"]);
  });
});

describe("a new codebook version while coding", () => {
  it("loads the new codebook and continues the same unit, keeping the answers given so far", async () => {
    const v1 = [unitLoop("loop", [unitVar("q1"), unitVar("q2")])];
    const v2 = [unitLoop("loop", [unitVar("q1"), unitVar("q2"), unitVar("q3")])];
    let version = 1;
    let rejectOnce = true;
    const posted: Record<string, VariableValue>[] = [];
    let unitsServed = 0;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session(version === 1 ? v1 : v2)),
      // Unit 1 is served until it is finished.
      getNextUnit: vi.fn(async () => (posted.length === 0 ? (unitsServed++, unit(1)) : null)),
      postUnitVariables: vi.fn(async (_unitId: number, variables: Record<string, VariableValue>) => {
        if (rejectOnce) {
          // Published meanwhile: the server refuses answers to the old version.
          rejectOnce = false;
          version = 2;
          throw Object.assign(new Error("A new version of the codebook was published"), { code: "codebook_changed" });
        }
        posted.push(variables);
      }),
    });
    const manager = new JobManager(server);
    await manager.start();
    const a = { done: true, values: [{ value: "A" }] } as VariableValue;
    await manager.answer(a); // q1
    await manager.answer(a); // q2: the unit is done, but the post is refused

    // Reloaded: the same unit, at the question the new version added, with q1 and q2 kept.
    expect(manager.getSnapshot().phase).toBe("unit_variable");
    expect(manager.getSnapshot().currentUnit?.id).toBe(1);
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("q3");
    expect(manager.getSnapshot().currentUnitVariables).toMatchObject({ q1: a, q2: a });
    expect(unitsServed).toBe(2);

    await manager.answer(a); // q3
    expect(posted).toHaveLength(1);
    expect(Object.keys(posted[0]).sort()).toEqual(["q1", "q2", "q3"]);
    expect(manager.getSnapshot().phase).toBe("finished");
  });
});

describe("end items", () => {
  const consent = { type: "question", name: "consent", variable: { type: "nominal", question: "?", options: [{ value: "yes" }, { value: "no" }] } };
  const pid = { type: "question", name: "pid", variable: { type: "auto", source: "url_param", urlParam: "pid" } };
  const stop = {
    type: "end",
    name: "stop",
    outcome: "screenout",
    message: "Bye $var.pid.value",
    redirectUrl: "https://panel.example/end?id=$var.pid.value",
  };
  const items = [
    pid,
    consent,
    { type: "condition", condition: { script: `$var.consent.is("no")` }, children: [stop] },
    confirm("after"),
  ] as TopLevelItem[];
  const variables = { pid: { done: true, skip: false, values: [{ value: "a b" }] } };

  it("ends the session when the coder reaches one, with its message and redirect", async () => {
    const server = makeFlakyServer({ getSession: vi.fn(async () => ({ ...session(items), variables })) });
    const manager = new JobManager(server);
    await manager.start();
    await manager.answer({ done: true, skip: false, values: [{ value: "no" }] });
    const snap = manager.getSnapshot();
    expect(snap.phase).toBe("finished");
    expect(server.endSession).toHaveBeenCalledWith("stop");
    expect(snap.ending?.item.outcome).toBe("screenout");
    expect(snap.ending?.message?.values.map((v) => v.text)).toEqual(["a b"]);
    expect(snap.ending?.redirectUrl).toBe("https://panel.example/end?id=a%20b");
  });

  it("goes on when the condition doesn't hold", async () => {
    const server = makeFlakyServer({ getSession: vi.fn(async () => ({ ...session(items), variables })) });
    const manager = new JobManager(server);
    await manager.start();
    await manager.answer({ done: true, skip: false, values: [{ value: "yes" }] });
    expect(itemName(manager.getSnapshot().currentItem!)).toBe("after");
    expect(server.endSession).not.toHaveBeenCalled();
  });

  it("shows the ending again after a reload", async () => {
    const server = makeFlakyServer({
      getSession: vi.fn(async () => ({ ...session(items), variables, ended: { item: "stop", outcome: "screenout" as const, at: new Date() } })),
    });
    const manager = new JobManager(server);
    await manager.start();
    expect(manager.getSnapshot().phase).toBe("finished");
    expect(manager.getSnapshot().ending?.redirectUrl).toBe("https://panel.example/end?id=a%20b");
    expect(server.endSession).not.toHaveBeenCalled();
  });

  it("in a loop: saves the unit, then ends", async () => {
    const loop = unitLoop("loop", [
      unitVar("q1"),
      { type: "condition", condition: { script: `$var.q1.is("B")` }, children: [{ type: "end", name: "fail", outcome: "screenout" }] },
      unitVar("q2"),
    ] as InLoopItem[]);
    const posted: Record<string, VariableValue>[] = [];
    const server = makeFlakyServer({
      getSession: vi.fn(async () => session([loop])),
      getNextUnit: vi.fn(async () => unit(1)),
      postUnitVariables: vi.fn(async (_id: number, vars: Record<string, VariableValue>) => void posted.push(vars)),
    });
    const manager = new JobManager(server);
    await manager.start();
    await manager.answer({ done: true, skip: false, values: [{ value: "B" }] });
    expect(posted).toEqual([{ q1: { done: true, skip: false, values: [{ value: "B" }] }, q2: { done: true, skip: true } }]);
    expect(server.endSession).toHaveBeenCalledWith("fail");
    expect(manager.getSnapshot().phase).toBe("finished");
  });
});
