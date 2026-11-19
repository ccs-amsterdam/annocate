import type { CoderUnitResponse, EndUnit, SessionResponse, TopLevelItem, VariableValue } from "@annotinder/contracts";
import { unitLoops } from "@annotinder/contracts";
import { CoderApiError, type CoderApi } from "../api/httpCoderApi";

// Tests only: an in-memory coder server with the real server's rules for
// what the coding client sees (docs/api/coder.md): the next units are the
// unfinished ones first, a finished unit can be fetched again with its
// answers, a reloaded session knows its finished units and coder-level
// answers, and an ended session shows its ending until it is reopened.

export interface FakeUnit {
  id: number;
  externalId?: string;
  data?: Record<string, unknown>;
  practice?: CoderUnitResponse["practice"];
}

export interface FakeCoderServerOptions {
  /** The design's items (as coders get them). */
  items: TopLevelItem[];
  /** Units per loop key (`"1"`, `"2"`, … in codebook order; contracts `unitLoops`). */
  units?: Record<string, FakeUnit[]>;
  /** Values `computeVariable` gives, by name (default: the first option). */
  computed?: Record<string, VariableValue>;
  /** Whether the coder can go back after finishing (`reopen`); default yes. */
  reopen?: boolean;
  title?: string;
}

export interface FakeCoderServer extends CoderApi {
  /** Coder-level answers as stored. */
  coder: Record<string, VariableValue>;
  /** Unit answers as stored, by `<loop>/<unitId>`. */
  answers: Map<string, Record<string, VariableValue>>;
  /** Finished units per loop, in the order they were finished. */
  done: Map<string, number[]>;
  /** How the session ended, if it did. */
  ended: { item?: string; unit?: EndUnit; outcome: "complete" | "quit" } | null;
  /** Units handed out by `getNextUnits` (with repeats), per loop. */
  served: Map<string, number[]>;
  /** Every API call, by name. */
  calls: string[];
  /**
   * A new design version: the session's codebook becomes `items`, and the
   * next request (other than loading the session) answers 409
   * `codebook_changed` without storing anything, as the server does.
   */
  redeploy(items: TopLevelItem[]): void;
}

const unitResponse = (unit: FakeUnit, variables: Record<string, VariableValue>): CoderUnitResponse => ({
  id: unit.id,
  externalId: unit.externalId ?? `unit-${unit.id}`,
  data: (unit.data ?? {}) as CoderUnitResponse["data"],
  variables,
  ...(unit.practice ? { practice: unit.practice } : {}),
});

export function fakeCoderServer(options: FakeCoderServerOptions): FakeCoderServer {
  const units = options.units ?? {};
  let items = options.items;
  let loops = unitLoops(items as never).map(({ key }) => key);
  /** The client's codebook is out of date: the next request is refused. */
  let stale = false;
  const check = () => {
    if (!stale) return;
    stale = false;
    throw new CoderApiError("A new version of the study was deployed", 409, "codebook_changed");
  };
  const server: FakeCoderServer = {
    coder: {},
    answers: new Map(),
    done: new Map(),
    ended: null,
    served: new Map(),
    calls: [],

    redeploy(next: TopLevelItem[]) {
      items = next;
      loops = unitLoops(items as never).map(({ key }) => key);
      stale = true;
    },

    async getSession(): Promise<SessionResponse> {
      server.calls.push("getSession");
      stale = false;
      return {
        coderId: 1,
        studyId: 1,
        version: 1,
        codebook: {
          id: 1,
          title: options.title ?? null,
          items,
        } as unknown as SessionResponse["codebook"],
        progress: loops.map((key) => ({
          set: key,
          doneUnitIds: [...(server.done.get(key) ?? [])],
          totalUnits: (units[key] ?? []).length,
        })) as SessionResponse["progress"],
        variables: { ...server.coder },
        frozen: [],
        session: {},
        ended: server.ended ? { outcome: server.ended.outcome, item: server.ended.item } : null,
        reopen: server.ended && options.reopen !== false ? { until: null } : null,
      } as unknown as SessionResponse;
    },

    async getNextUnits(loop: string, count = 1) {
      server.calls.push(`getNextUnits:${loop}`);
      check();
      const done = new Set(server.done.get(loop) ?? []);
      const next = (units[loop] ?? []).filter((u) => !done.has(u.id)).slice(0, count);
      server.served.set(loop, [...(server.served.get(loop) ?? []), ...next.map((u) => u.id)]);
      return next.map((u) => unitResponse(u, {}));
    },

    async getLoopUnit(loop: string, unitId: number) {
      server.calls.push(`getLoopUnit:${loop}/${unitId}`);
      check();
      const unit = (units[loop] ?? []).find((u) => u.id === unitId);
      if (!unit) throw Object.assign(new Error("Unit not found"), { status: 404 });
      return unitResponse(unit, server.answers.get(`${loop}/${unitId}`) ?? {});
    },

    async postUnitVariables(unitId: number, variables: Record<string, VariableValue>, loop = "1") {
      server.calls.push(`postUnitVariables:${loop}/${unitId}`);
      check();
      server.answers.set(`${loop}/${unitId}`, variables);
      const done = server.done.get(loop) ?? [];
      if (!done.includes(unitId)) server.done.set(loop, [...done, unitId]);
    },

    async postCoderVariables(variables: Record<string, VariableValue>) {
      server.calls.push("postCoderVariables");
      check();
      Object.assign(server.coder, variables);
    },

    async computeVariable(name: string) {
      server.calls.push(`computeVariable:${name}`);
      check();
      const value = options.computed?.[name] ?? ({ done: true, values: [{ value: "a" }] } as VariableValue);
      server.coder[name] = value;
      return value;
    },

    async endSession(item?: string, unit?: EndUnit) {
      server.calls.push(`endSession:${item ?? ""}`);
      check();
      server.ended = { item, unit, outcome: "complete" };
      return { reopen: options.reopen === false ? null : { until: null } } as never;
    },

    async reopenSession() {
      server.calls.push("reopenSession");
      check();
      server.ended = null;
    },

    async quitSession() {
      server.calls.push("quitSession");
      check();
      server.ended = { outcome: "quit" };
    },
  };
  return server;
}
