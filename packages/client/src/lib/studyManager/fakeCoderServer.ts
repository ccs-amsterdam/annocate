import type {
  AnyVariableType,
  CoderUnitLoopItem,
  CoderUnitResponse,
  EndUnit,
  SessionResponse,
  TopLevelItem,
  VariableValue,
} from "@annotinder/contracts";
import { collectQuestions, resolveVariable, unitLoops, validateVariables } from "@annotinder/contracts";
import { CoderApiError, type CoderApi } from "../api/httpCoderApi";
import { loopVariables } from "./items";

// Tests only: an in-memory coder server with the real server's rules for
// what the coding client sees (docs/api/coder.md): the next units are the
// unfinished ones first, a finished unit can be fetched again with its
// answers, a reloaded session knows its finished units and coder-level
// answers, and an ended session shows its ending until it is reopened.
// Posted answers are checked as the server checks them (contracts
// `validateVariables`): a unit is complete, and every answer fits its question.

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
  /** Values `assignCondition` gives, by name (default: the first option). */
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
  /** The next request whose call name starts with `call` (e.g. `endSession`) fails, storing nothing. */
  fail(call: string, error?: Error): void;
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
  /** Requests to fail once (`fail`), by the start of their call name. */
  const failing = new Map<string, Error>();
  /** Logs a request, and refuses it if it was set to fail or the client's codebook is out of date. */
  const request = (call: string) => {
    server.calls.push(call);
    for (const [start, error] of failing) {
      if (!call.startsWith(start)) continue;
      failing.delete(start);
      throw error;
    }
    if (!stale) return;
    stale = false;
    throw new CoderApiError("A new version of the study was deployed", 409, "codebook_changed");
  };
  /** Refuses answers the server refuses (400): unknown questions, values that don't fit. */
  const validate = (types: Map<string, AnyVariableType>, variables: Record<string, VariableValue>) => {
    const errors = validateVariables(types, variables);
    if (errors.length > 0) throw new CoderApiError(errors.join("; "), 400);
  };
  /** A loop's questions for a unit, with options from data as the unit and its answers give them. */
  const unitTypes = (loop: string, unit: FakeUnit | undefined, answers: Record<string, VariableValue>) => {
    const item = unitLoops(items as never).find(({ key }) => key === loop)?.loop;
    const types = item ? loopVariables(item as CoderUnitLoopItem) : new Map<string, AnyVariableType>();
    const ctx = { unit: unit?.data, answers, questions: types };
    return new Map([...types].map(([name, variable]) => [name, resolveVariable(variable, ctx)]));
  };
  const coderTypes = () => {
    const { questions, loopOf } = collectQuestions(items);
    return new Map([...questions].filter(([name]) => loopOf.get(name) === null));
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

    fail(call: string, error: Error = new CoderApiError(`${call} failed`, 400)) {
      failing.set(call, error);
    },

    async getSession(): Promise<SessionResponse> {
      server.calls.push("getSession");
      stale = false;
      return {
        sessionId: 1,
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
      request(`getNextUnits:${loop}`);
      const done = new Set(server.done.get(loop) ?? []);
      const next = (units[loop] ?? []).filter((u) => !done.has(u.id)).slice(0, count);
      server.served.set(loop, [...(server.served.get(loop) ?? []), ...next.map((u) => u.id)]);
      return next.map((u) => unitResponse(u, {}));
    },

    async getLoopUnit(loop: string, unitId: number) {
      request(`getLoopUnit:${loop}/${unitId}`);
      const unit = (units[loop] ?? []).find((u) => u.id === unitId);
      if (!unit) throw Object.assign(new Error("Unit not found"), { status: 404 });
      return unitResponse(unit, server.answers.get(`${loop}/${unitId}`) ?? {});
    },

    async postUnitVariables(unitId: number, variables: Record<string, VariableValue>, loop = "1") {
      request(`postUnitVariables:${loop}/${unitId}`);
      const unit = (units[loop] ?? []).find((u) => u.id === unitId);
      const types = unitTypes(loop, unit, { ...server.answers.get(`${loop}/${unitId}`), ...variables });
      const missing = [...types.keys()].filter((name) => !(name in variables));
      if (missing.length > 0) throw new CoderApiError(`Unit not finished: no answer for ${missing.join(", ")}`, 400);
      validate(types, variables);
      server.answers.set(`${loop}/${unitId}`, variables);
      const done = server.done.get(loop) ?? [];
      if (!done.includes(unitId)) server.done.set(loop, [...done, unitId]);
    },

    async postCoderVariables(variables: Record<string, VariableValue>) {
      request("postCoderVariables");
      validate(coderTypes(), variables);
      Object.assign(server.coder, variables);
    },

    async assignCondition(name: string) {
      request(`assignCondition:${name}`);
      const value = options.computed?.[name] ?? ({ done: true, values: [{ value: "a" }] } as VariableValue);
      server.coder[name] = value;
      return value;
    },

    async endSession(item?: string, unit?: EndUnit) {
      request(`endSession:${item ?? ""}`);
      server.ended = { item, unit, outcome: "complete" };
      return { reopen: options.reopen === false ? null : { until: null } } as never;
    },

    async reopenSession() {
      request("reopenSession");
      server.ended = null;
    },

    async quitSession() {
      request("quitSession");
      server.ended = { outcome: "quit" };
    },
  };
  return server;
}
