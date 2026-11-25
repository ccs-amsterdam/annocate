import { beforeEach, expect } from "vitest";
import type {
  CoderUnitResponse,
  DeploymentResponse,
  Limits,
  SessionResponse,
  UnitData,
  VariableValue,
} from "@annotinder/contracts";
import { CROWD_INVITE, inviteKind, splitDesignItems, type CoderKind, type Invite } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { eq } from "drizzle-orm";
import { units } from "../db/schema/index.js";
import { unitDraftData } from "../db/sql.js";
import { emptyDb, query } from "./testDb.js";
import { seed } from "../seed.js";
import { DEMO_PUBLIC_ID } from "../db/publicId.js";
import { createApp, type AppOptions } from "../app.js";
import { ensureUser } from "../shared/accounts.js";
import { CLIENT_ID, CLIENT_SECRET, ISSUER, mockIssuer } from "./mockIssuer.js";
import type { RuntimeOptions } from "../runtime/runtime.js";
import type { Store } from "../runtime/store.js";

// What the coder tests (coder.*.test.ts) share. End-to-end: client -> server
// -> database, through the app's fetch handler (no sockets), on the seeded
// demo study, emptied before each test. A new app on the same database is a
// restart (`restart`, `useServer`).

/** A coder's login: a verified email, no second factor needed. */
export const CODER_LOGIN = { mfa: false, authTime: null, issuer: "https://idp.test" };

/**
 * Makes study 1 one with expert coders or a crowd, whatever it has
 * deployed: the tests run both kinds on the seeded study (a study's own
 * kind is fixed by its first deploy).
 */
export async function setCoderKind(kind: CoderKind): Promise<void> {
  await query(db, "UPDATE studies SET coder_kind = $1 WHERE id = 1", [kind]);
}

/**
 * Design items as a design to save (their Session item as its `session`),
 * for study 1 made a study of the kind it invites (`setCoderKind`): a crowd
 * with one open link unless the items say who codes.
 */
export async function designFor(items: object[]) {
  const split = splitDesignItems(items);
  const invite: Invite = split.session.invite ?? CROWD_INVITE;
  await setCoderKind(inviteKind(invite));
  return { ...split, session: { ...split.session, invite } };
}

export const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

export let db: Db;
export let server: ReturnType<typeof createApp>;

/** What the runtime read or wrote (Store method names), in order (`forgetStoreCalls` empties it). */
export let storeCalls: string[] = [];

/** Records every Store call in `storeCalls`. */
export function recording(store: Store): Store {
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        storeCalls.push(String(prop));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

/**
 * A (re)started server on the same database: empty memory. Draws are
 * predictable: `random` is 0 (a balanced tie goes to the first value) unless
 * a test sets it.
 */
export function restart(runtime: Partial<RuntimeOptions> = {}, options: Partial<AppOptions> = {}) {
  return createApp(db, {
    secret: "test-secret",
    runtime: { random: () => 0, ...runtime },
    wrapStore: recording,
    devMode: true,
    ...options,
  });
}

/** A (re)started server that has a login (a mock provider's): its coders can be offered to sign in. */
export function restartWithLogin() {
  const oidc = { issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: mockIssuer().fetch };
  return restart({}, { login: { oidc, publicUrl: "http://annotinder.test" } });
}

/**
 * Gives study 1 an owner (it is seeded without one), with these limits of
 * their own: `{ crowdSignIn: true }` lets the study's crowd sign in.
 */
export async function ownedBy(email: string, limits: Limits = {}): Promise<number> {
  const owner = await ensureUser(db, email);
  await query(db, "UPDATE users SET limits = $1 WHERE id = $2", [JSON.stringify(limits), owner.id]);
  await query(db, "UPDATE studies SET owner_id = $1 WHERE id = 1", [owner.id]);
  return owner.id;
}

beforeEach(async () => {
  db = await emptyDb();
  await seed(db);
  server = restart();
  storeCalls = [];
  devices = new Map();
});

/**
 * Simulated browsers, by name: their cookies, and the link they were
 * opened with (a reload sends it again, like the client does from the URL).
 */
export let devices = new Map<string, { cookies: Map<string, string>; linkSecret: string | null }>();

/** A request from a device: sends its cookies and the client header, keeps cookies it is given. */
export async function send(
  name: string,
  path: string,
  init: RequestInit = {},
  headers: Record<string, string> = {},
  app = () => server,
) {
  let device = devices.get(name);
  if (!device) devices.set(name, (device = { cookies: new Map(), linkSecret: null }));
  const cookie = [...device.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await app().request(`/api/d/${DEMO_PUBLIC_ID}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-annotinder": "1",
      ...(cookie ? { cookie } : {}),
      ...(init.headers as Record<string, string> | undefined),
      ...headers,
    },
  });
  for (const set of res.headers.getSetCookie()) {
    const [pair] = set.split(";");
    const at = pair.indexOf("=");
    device.cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return res;
}

/** A coder on device `name`, opened with `link` (`null`: the link the device was opened with before, if any). */
export function coder(name: string, linkSecret: string | null = "demo-secret", app = () => server) {
  if (!devices.has(name)) devices.set(name, { cookies: new Map(), linkSecret: null });
  const device = devices.get(name)!;
  if (linkSecret !== null) device.linkSecret = linkSecret;
  const call = (path: string, init?: RequestInit) =>
    send(name, path, init, device.linkSecret ? { "x-link-secret": device.linkSecret } : {}, app);
  return {
    session: async () => (await call("/session")).json() as Promise<SessionResponse>,
    next: async (loop = "loop_1") => {
      const res = await call(`/loop/${loop}/next`);
      expect(res.status).toBe(200);
      return ((await res.json()) as { units: CoderUnitResponse[] }).units[0] ?? null;
    },
    batch: async (count: number, loop = "loop_1") => {
      const res = await call(`/loop/${loop}/next?count=${count}`);
      expect(res.status).toBe(200);
      return ((await res.json()) as { units: CoderUnitResponse[] }).units;
    },
    submit: (unitId: number, variables: Record<string, Partial<VariableValue>>, loop?: string) =>
      call("/variables/unit", { method: "POST", body: JSON.stringify({ unitId, loop, variables }) }),
    call,
  };
}

/** A finished unit in the one-question design versions `redeploy` creates. */
export const sentiment = (code: string) => ({ sentiment: { done: true, values: [{ value: code }] } });
/** A finished unit in the seeded demo codebook: sentiment, plus its other loop questions skipped. */
export const demo = (code: string) => ({
  ...sentiment(code),
  is_news: { done: true, skip: true },
  topics: { done: true, skip: true },
  actors_and_issues: { done: true, skip: true },
  framing: { done: true, skip: true },
  usefulness: { done: true, skip: true },
});

export async function unitByExternalId(externalId: string): Promise<{ id: number }> {
  return (await query<{ id: number }>(db, "SELECT id FROM units WHERE external_id = $1", [externalId]))[0];
}

/** Live unit answers in the database, per unit and coder. */
export async function dbAnnotations() {
  const rows = await query<{
    unitId: number;
    sessionId: number;
    variable: string;
    value: VariableValue;
    designVersionId: number;
  }>(
    db,
    `SELECT unit_id AS "unitId", session_id AS "sessionId", variable, value, design_version_id AS "designVersionId"
     FROM annotation_values WHERE unit_id IS NOT NULL AND retired_at IS NULL ORDER BY unit_id, session_id`,
  );
  const byUnit = new Map<
    string,
    { unitId: number; sessionId: number; variables: Record<string, VariableValue>; designVersionIds: number[] }
  >();
  for (const row of rows) {
    const key = `${row.unitId}/${row.sessionId}`;
    if (!byUnit.has(key))
      byUnit.set(key, { unitId: row.unitId, sessionId: row.sessionId, variables: {}, designVersionIds: [] });
    byUnit.get(key)!.variables[row.variable] = row.value;
    byUnit.get(key)!.designVersionIds.push(row.designVersionId);
  }
  return [...byUnit.values()];
}

export const sentimentQuestion = {
  type: "question",
  name: "sentiment",
  variable: {
    type: "nominal",
    question: "?",
    options: [{ value: "positive" }, { value: "negative" }, { value: "neutral" }],
  },
};

/** The main loop's id in `redeploy`: the first of loop_1, loop_2, … that the other items' loops don't have. */
export function mainLoopId(extraItems: object[]): string {
  const taken = new Set(JSON.stringify(extraItems).match(/loop_\d+/g) ?? []);
  for (let n = 1; ; n++) if (!taken.has(`loop_${n}`)) return `loop_${n}`;
}

/**
 * Creates a design with the given unit_loop settings (by default with one
 * question, `sentiment`) and deploys it as a new version, in a study of the
 * kind the design invites (`setCoderKind`). Returns the deployment response.
 */
export async function redeploy(
  { layout, ...loop }: { layout?: object } & Record<string, unknown>,
  extraItems: object[] = [],
): Promise<DeploymentResponse> {
  const mainLoop = {
    type: "unit_loop",
    id: mainLoopId(extraItems),
    label: "main_loop",
    units: {},
    // `layout`: the loop's layout item (first)
    children: [{ type: "layout", template: "", ...layout }, sentimentQuestion],
    ...loop,
  };
  // A Session item among them goes into `session` (docs/architecture.md §6)
  const design = await designFor(withDivide([...extraItems, mainLoop]));
  const res = await server.request("/api/study/1/design", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ note: "v2", ...design }),
  });
  expect(res.status).toBe(201);
  const codebook = (await res.json()) as { id: number };
  const deploy = await server.request("/api/study/1/deployment", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ designVersionId: codebook.id, units: true }),
  });
  expect(deploy.status).toBe(200);
  return (await deploy.json()) as DeploymentResponse;
}

/** Deploys the draft units and sets with the deployed design version (docs/architecture.md §8.4). */
export async function deployDrafts(): Promise<DeploymentResponse> {
  const current = (await (await server.request("/api/study/1/deployment", { headers: adminHeaders })).json()) as {
    designVersionId: number;
  };
  const res = await server.request("/api/study/1/deployment", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ designVersionId: current.designVersionId, units: true }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as DeploymentResponse;
}

/** A unit of the draft: its external id and data. */
export async function draftUnit(id: number): Promise<{ externalId: string; data: UnitData }> {
  const [row] = await db
    .select({ externalId: units.externalId, data: unitDraftData(units.id) })
    .from(units)
    .where(eq(units.id, id));
  return row!;
}

/** Makes expert coders of study 1 (those there already stay as they are); `email`: what they sign in with. */
export async function addCoders(coders: (string | { coder: string; email?: string })[]): Promise<void> {
  const known = new Set(((await listOf("coders")) as { coder: string }[]).map((c) => c.coder));
  const fresh = coders.map((c) => (typeof c === "string" ? { coder: c } : c)).filter((c) => !known.has(c.coder));
  if (fresh.length === 0) return;
  const res = await server.request("/api/study/1/coders", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ coders: fresh }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
}

/**
 * Adds a set to a column with a role, replacing a set of that name. Returns
 * its unit ids. A set of `coder_set` is a coder's: made an expert coder first.
 */
export async function createSet(name: string, externalIds: string[], group: string) {
  if (group === "coder_set") await addCoders([name]);
  const ids = await Promise.all(externalIds.map(async (e) => (await unitByExternalId(e)).id));
  const groups = (await (await server.request("/api/study/1/sets", { headers: adminHeaders })).json()) as {
    name: string;
    sets: { name: string }[];
  }[];
  const sets = (groups.find((g) => g.name === group)?.sets ?? []).filter((s) => s.name !== name);
  const res = await server.request(`/api/study/1/sets/${group}`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ sets: [...sets, { name, unitIds: ids }] }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return ids;
}

/** A list of study 1 from the researcher API (`{ <items>: [...] }`): its items. */
export async function listOf(path: "coders" | "sessions" | "links" | "devices" | "design"): Promise<unknown[]> {
  const page = (await (await server.request(`/api/study/1/${path}`, { headers: adminHeaders })).json()) as Record<
    string,
    unknown[]
  >;
  return page[path === "design" ? "versions" : path]!;
}

/** The deployed design version's links: params -> secret. */
export async function links(): Promise<
  { id: number; secret: string; params: Record<string, string>; retiredAt: string | null }[]
> {
  return (await listOf("links")) as never;
}

let extraLinks = 0;
/** Another link to the study. Made directly: links come from the deployed design version, so a later deploy retires it. */
export async function link() {
  const secret = `extra-${++extraLinks}`;
  await query(db, "INSERT INTO links (study_id, label, secret, link_key) VALUES (1, 'x', $1, $2)", [
    secret,
    JSON.stringify(["test", extraLinks]),
  ]);
  return secret;
}

/** The coder reached an experiment: its value. */
export async function reach(c: ReturnType<typeof coder>, name: string) {
  const res = await c.call(`/experiment/${name}`, { method: "POST" });
  expect(res.status).toBe(200);
  return ((await res.json()) as { value: VariableValue }).value.values ?? [];
}

/** A Session item (contracts SessionItemSchema). */
export const sessionItem = (extra: object) => ({ type: "session", ...extra });
/**
 * A crowd invitation (contracts CrowdInviteSchema); `divide`: the loops'
 * units are divided among the coders with these criteria (each loop's
 * `units.divide` unless it has its own, set by `redeploy`).
 */
export const crowd = (divide?: object, extra: object = {}) =>
  sessionItem({ invite: { mode: "crowd", ...extra }, ...(divide ? { [DIVIDE]: divide } : {}) });
export const DIVIDE = "__divide";

/** The items with a crowd's `divide` (`crowd`) in every unit loop without its own; top-level end items in a branch. */
export function withDivide(items: object[]): object[] {
  const session = items.find((i) => (i as { type?: string }).type === "session") as Record<string, unknown> | undefined;
  const divide = session?.[DIVIDE];
  return items.map((raw) => {
    const it = raw as { type?: string; units?: Record<string, unknown> } & Record<string, unknown>;
    if (it.type === "session") {
      const { [DIVIDE]: _divide, ...rest } = it;
      void _divide;
      return rest;
    }
    if (it.type === "end") return { type: "branch", condition: { script: "true" }, children: [it] };
    if (it.type === "unit_loop" && divide && !it.units?.divide && !it.units?.sameAsPrevious)
      return { ...it, units: { ...it.units, divide } };
    return it;
  });
}
/** Expert coders: the values of `coder_set`, each with their own link (or signing in, `login`). */
export const codersInvite = (link: "per_coder" | "login" = "per_coder") =>
  sessionItem({ invite: { mode: "coders", link } });

/** Runs the tests on this server from now on (a restart, or another process on the same database). */
export function useServer(app: ReturnType<typeof createApp>): void {
  server = app;
}

/** Forgets the store calls recorded so far. */
export function forgetStoreCalls(): void {
  storeCalls = [];
}
