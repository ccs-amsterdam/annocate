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
import { describe, expect, it, vi } from "vitest";

import type { JobServer } from "../api/httpJobServer";
import { JobManager } from "./JobManager";

function confirm(name: string): UserVariableItem {
  return { name, type: "user_variable", variable: { type: "confirm", question: "?" } };
}

function unitLoop(name: string, children: InLoopItem[], unitset = "__all__"): UnitLoopItem {
  return { name, type: "unit_loop", units: [{ sources: [{ unitset }] }], layout: { template: "" }, children };
}

function unitVar(name: string): UnitVariableItem {
  return {
    name,
    type: "unit_variable",
    variable: { type: "select_code", question: "?", codes: [{ code: "A" }, { code: "B" }] },
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

/** A stub JobServer whose methods can be individually made to reject once, then succeed. */
function makeFlakyServer(overrides: Partial<JobServer> = {}): JobServer & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const base: JobServer = {
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

    await manager.answer({ value: true } as unknown as VariableValue, true);
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
    expect(manager.getSnapshot().currentItem?.name).toBe("sentiment");

    await manager.answer({ codes: [{ value: "A" }] } as unknown as VariableValue, "A");
    expect(manager.getSnapshot().phase).toBe("error");

    await manager.retry();
    expect(postUnitVariables).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot().phase).toBe("finished");
  });

  it("skips auto variables and uses their server-assigned values in conditions", async () => {
    const items = [
      { type: "question", name: "group", variable: { type: "auto", source: "balanced", options: [{ code: "a" }, { code: "b" }] } },
      { type: "condition", name: "only_a", expression: "group.codes[0].code === 'a'", children: [confirm("shown_to_a")] },
      confirm("everyone"),
    ] as TopLevelItem[];
    const server = makeFlakyServer({
      getSession: vi.fn(async () => ({
        ...session(items),
        variables: { group: { done: true, skip: false, codes: [{ code: "a" }] } },
      })),
    });
    const manager = new JobManager(server);
    await manager.start();
    expect(manager.getSnapshot().currentItem?.name).toBe("shown_to_a");
  });

  it("asks the job server for the next unit by loop name", async () => {
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
    expect(getNextUnit).toHaveBeenCalledWith("loop_all_units");
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

    expect(manager.getSnapshot().currentItem?.name).toBe("q1");
    expect(manager.getSnapshot().navigation.canGoBack).toBe(false);

    // Answer first question
    await manager.answer({ codes: [{ value: "A" }] } as unknown as VariableValue, "A");
    expect(manager.getSnapshot().currentItem?.name).toBe("q2");
    expect(manager.getSnapshot().navigation.canGoBack).toBe(true);

    // Go back to first question
    await manager.goBack();
    expect(manager.getSnapshot().currentItem?.name).toBe("q1");
    expect(manager.getSnapshot().currentUnitVariables?.q1).toBeDefined();

    // Can go forward to second question
    expect(manager.getSnapshot().navigation.canGoForward).toBe(true);
    await manager.goForward();
    expect(manager.getSnapshot().currentItem?.name).toBe("q2");
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
    await manager.answer({ codes: [{ value: "pos" }] } as unknown as VariableValue, "pos");

    // Unit 102
    expect(manager.getSnapshot().currentUnit?.id).toBe(102);
    expect(manager.getSnapshot().navigation.canGoBack).toBe(true);
    expect(postedUnits[101]).toBeDefined();

    // Go back to Unit 101
    await manager.goBack();
    expect(manager.getSnapshot().currentUnit?.id).toBe(101);
    expect(manager.getSnapshot().currentUnitVariables?.sentiment).toEqual({ codes: [{ value: "pos" }], done: true });

    // Modify answer for Unit 101 and re-submit
    await manager.answer({ codes: [{ value: "neg" }] } as unknown as VariableValue, "neg");

    // Should now automatically advance to Unit 102 from history!
    expect(manager.getSnapshot().currentUnit?.id).toBe(102);
    expect(postedUnits[101].sentiment).toEqual({ codes: [{ value: "neg" }], done: true });
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
    await manager.answer({ codes: [{ value: "1" }] } as unknown as VariableValue, "1");
    // Answer unit 2
    await manager.answer({ codes: [{ value: "2" }] } as unknown as VariableValue, "2");
    // Now on unit 3
    expect(manager.getSnapshot().currentUnit?.id).toBe(3);
    expect(manager.getSnapshot().navigation.totalUnitsInHistory).toBe(3);

    // Jump directly to unit index 0 (unit id 1)
    await manager.jumpToUnit(0);
    expect(manager.getSnapshot().currentUnit?.id).toBe(1);
    expect(manager.getSnapshot().currentUnitVariables?.rating).toEqual({ codes: [{ value: "1" }], done: true });
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
    expect(manager.getSnapshot().currentItem?.name).toBe("consent");

    await manager.answer({ value: true } as unknown as VariableValue, true);
    expect(manager.getSnapshot().phase).toBe("unit_variable");

    // Jump back to consent phase (phase index 0)
    await manager.jumpToPhase(0);
    expect(manager.getSnapshot().phase).toBe("user_variable");
    expect(manager.getSnapshot().currentItem?.name).toBe("consent");

    // Jump forward to unit loop phase (phase index 1)
    await manager.jumpToPhase(1);
    expect(manager.getSnapshot().phase).toBe("unit_variable");
    expect(manager.getSnapshot().currentUnit?.id).toBe(1);
  });
});

describe("resuming a session", () => {
  const code = (c: string) => ({ done: true, skip: false, codes: [{ code: c }] });
  const select = (name: string, codes: string[]) =>
    ({ type: "question", name, variable: { type: "select_code", question: name, codes: codes.map((c) => ({ code: c })) } }) as InLoopItem;
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
    expect(snap.currentItem?.name).toBe("q1");
    const loopPhase = snap.navigation.phases.find((p) => p.type === "unit_loop")!;
    expect(loopPhase).toMatchObject({ unitCount: 3, totalUnits: 5, currentUnitIndex: 2 });
    expect(getLoopUnit).not.toHaveBeenCalled();
    expect(snap.navigation.canGoBack).toBe(true);

    await manager.goBack(); // to the last question of unit 11, loaded on demand
    expect(getLoopUnit).toHaveBeenCalledWith("main", 11);
    expect(manager.getSnapshot().currentUnit?.id).toBe(11);
    expect(manager.getSnapshot().currentItem?.name).toBe("q2");
  });

  it("asks again when a stored answer no longer fits the codebook", async () => {
    const items = [select("group", ["a", "b"]) as unknown as TopLevelItem, unitLoop("main", [select("q1", ["a"])])];
    const { server } = resumedServer({ items, variables: { group: code("removed_code") } });
    const manager = new JobManager(server);
    await manager.start();
    expect(manager.getSnapshot().currentItem?.name).toBe("group");
  });

  it("starts a partly answered unit at its first open question, dropping invalid answers", async () => {
    const partly = resumedServer({ nextUnit: unitWith(12, { q1: code("a") }) });
    const m1 = new JobManager(partly.server);
    await m1.start();
    expect(m1.getSnapshot().currentItem?.name).toBe("q2");

    const changed = resumedServer({ nextUnit: unitWith(12, { q1: code("gone"), q2: code("x") }) });
    const m2 = new JobManager(changed.server);
    await m2.start();
    expect(m2.getSnapshot().currentItem?.name).toBe("q1");
    expect(m2.getSnapshot().currentUnitVariables).not.toHaveProperty("q1");
  });
});

describe("submitting a finished unit", () => {
  it("posts every question of the loop, with skip for those a condition hid", async () => {
    const hidden = { type: "condition", name: "never", expression: "false", children: [unitVar("q2")] } as InLoopItem;
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
