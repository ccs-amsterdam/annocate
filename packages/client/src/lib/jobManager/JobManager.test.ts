import type { CodebookItem, CoderUnitResponse, SessionResponse, VariableValue } from "@annotinder/contracts";
import { describe, expect, it, vi } from "vitest";

import type { JobServer } from "../api/httpJobServer";
import { JobManager } from "./JobManager";

function confirm(position: string, name: string): CodebookItem {
  return { position, name, type: "user_variable", variable: { type: "confirm", question: "?" } };
}

function unitLoop(position: string, name: string, unitset = "main"): CodebookItem {
  return { position, name, type: "unit_loop", unitset, layout: { template: "" } };
}

function unitVar(position: string, name: string): CodebookItem {
  return {
    position,
    name,
    type: "unit_variable",
    variable: { type: "select_code", question: "?", codes: [{ code: "A" }, { code: "B" }] },
  };
}

function session(items: CodebookItem[]): SessionResponse {
  return {
    codebook: { id: 1, name: "cb", items, immutable: false, created: new Date() } as SessionResponse["codebook"],
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
      return session([confirm("1", "consent")]);
    }),
    getNextUnit: vi.fn(async () => {
      calls.getNextUnit = (calls.getNextUnit ?? 0) + 1;
      return null;
    }),
    postUnitVariables: vi.fn(async () => {
      calls.postUnitVariables = (calls.postUnitVariables ?? 0) + 1;
    }),
    postCoderVariables: vi.fn(async () => {
      calls.postCoderVariables = (calls.postCoderVariables ?? 0) + 1;
    }),
  };
  return Object.assign({ ...base, ...overrides }, { calls });
}

describe("JobManager error/retry handling (design plan §6.3)", () => {
  it("start() publishes an error phase when getSession rejects, and retry() re-attempts it", async () => {
    let attempts = 0;
    const server = makeFlakyServer({
      getSession: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("network down");
        return session([confirm("1", "consent")]);
      }),
    });
    const manager = new JobManager(server);

    await manager.start();
    expect(manager.getSnapshot().phase).toBe("error");
    expect(manager.getSnapshot().error).toBe("network down");

    await manager.retry();
    expect(manager.getSnapshot().phase).toBe("user_variable");
    expect(manager.getSnapshot().currentItem?.name).toBe("consent");
    expect(attempts).toBe(2);
  });

  it("answer() failing to postCoderVariables goes to error phase, and retry() re-posts the same value", async () => {
    let failNext = true;
    const postCoderVariables = vi.fn(async (vars: Record<string, VariableValue>): Promise<void> => {
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
    // Both calls posted the same (idempotent, full-replace) payload.
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
      getSession: vi.fn(async () => session([unitLoop("1", "loop"), unitVar("1.1", "sentiment")])),
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
});
