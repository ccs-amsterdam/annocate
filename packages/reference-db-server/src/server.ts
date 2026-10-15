import { createHash } from "node:crypto";
import { Hono, type Context } from "hono";
import {
  ALL_UNITS_UNITSET,
  BackendAnnotationBatchSchema,
  BackendCoderWriteSchema,
  FinishedRequestSchema,
  ResolveCoderRequestSchema,
  type BackendAnnotation,
  type BackendCoder,
  type BackendFinished,
  type CoderAssignments,
  type ConformanceFixture,
  type DeploymentSpec,
  type VariableValue,
} from "@annotinder/contracts";

// Reference db server: the backend API (contracts `backendEndpoints`) and
// nothing else, in memory, for one job loaded from a fixture. It is meant to
// be read as the specification of what a db server does for the job server
// (docs/architecture.md); real db servers (AmCAT, ...) add storage, a
// researcher API and auth of their own. Checked by packages/conformance.

interface Invite {
  secret: string;
  auth: "none" | "optional" | "required";
  maxUses?: number;
  uses: number;
  participantId?: string;
  participantFromUrl?: boolean;
  variables: Record<string, string>;
}

interface Coder {
  id: number;
  key: string;
  participantId?: string;
  /** Sticky loop routing: distribution state, not annotations, so kept here. */
  assignments: CoderAssignments;
}

/**
 * One value of one variable, for one unit and coder. Coder-level values
 * (survey questions, `auto` variables) are the same rows with `unitId: null`.
 * Retired values stay, but no longer count.
 */
interface Value {
  unitId: number | null;
  coderId: number;
  variable: string;
  value: VariableValue;
  codebookId?: number;
  /** Hash of the unit content the coder was shown (unit-level values). */
  unitHash?: string;
  created: Date;
  updated: Date;
  retiredAt?: Date;
}

export interface Store {
  spec: DeploymentSpec;
  units: Map<number, { id: number; externalId: string; data: Record<string, string | number | boolean>; hash: string }>;
  invites: Invite[];
  coders: Coder[];
  values: Value[];
}

/** Loads a fixture as job `jobId`, deployed as version 1. */
export function loadFixture(fixture: ConformanceFixture, jobId = 1): Store {
  // Units never change here; a db server that lets them change must change the hash too.
  const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
  const units = new Map(fixture.units.map((u, i) => [i + 1, { id: i + 1, ...u, hash: hash(u.data) }]));
  const idOf = new Map([...units.values()].map((u) => [u.externalId, u.id]));
  return {
    spec: {
      jobId,
      version: 1,
      active: true,
      annotationEpoch: 0,
      codebook: { id: 1, jobId, ...fixture.codebook, created: new Date(), immutable: true },
      unitsets: [
        { name: ALL_UNITS_UNITSET, unitIds: [...units.keys()] },
        ...fixture.unitsets.map((u) => ({ name: u.name, unitIds: u.externalIds.map((e) => idOf.get(e)!) })),
      ],
    },
    units,
    invites: fixture.invites.map((i) => ({ ...i, uses: 0, variables: i.variables ?? {} })),
    coders: [],
    values: [],
  };
}

const live = (v: Value) => v.retiredAt === undefined;

export function createServer(store: Store, secret: string) {
  const liveValue = (unitId: number | null, coderId: number, variable: string) =>
    store.values.find((v) => live(v) && v.unitId === unitId && v.coderId === coderId && v.variable === variable);

  /** Upserts a live value per variable; others are left alone. */
  const upsert = (
    unitId: number | null,
    coderId: number,
    variables: Record<string, VariableValue>,
    meta: { codebookId?: number; unitHash?: string } = {},
  ) => {
    const now = new Date();
    for (const [variable, value] of Object.entries(variables)) {
      const existing = liveValue(unitId, coderId, variable);
      if (existing) Object.assign(existing, { value, updated: now, ...meta });
      else store.values.push({ unitId, coderId, variable, value, ...meta, created: now, updated: now });
    }
  };

  const toBackendCoder = (c: Coder): BackendCoder => ({
    coderId: c.id,
    variables: Object.fromEntries(
      store.values.filter((v) => live(v) && v.unitId === null && v.coderId === c.id).map((v) => [v.variable, v.value]),
    ),
    assignments: c.assignments,
  });

  const app = new Hono();
  const api = new Hono();

  // Only the job server may call this API: it presents the shared secret.
  api.use("*", async (c, next) => {
    if (c.req.header("authorization") !== `Bearer ${secret}`) return c.json({ error: "Unauthorized" }, 401);
    if (Number(c.req.param("jobId")) !== store.spec.jobId) return c.json({ error: "Job not found" }, 404);
    await next();
  });

  api.get("/deployment", (c) => c.json(store.spec));

  // Unit content by id; unknown ids are left out.
  api.get("/units", (c) => {
    const ids = (c.req.query("ids") ?? "").split(",").map(Number);
    return c.json(ids.flatMap((id) => store.units.get(id) ?? []));
  });

  api.get("/coders", (c) => c.json(store.coders.map(toBackendCoder)));

  // A coder by key; created from an invite on first use (docs/coder-identity.md).
  api.post("/coders/resolve", async (c) => {
    const body = await parse(c, ResolveCoderRequestSchema);
    if (!body) return c.json({ error: "Invalid body" }, 400);
    const known = store.coders.find((coder) => coder.key === body.coderKey);
    if (known) return c.json(toBackendCoder(known));

    const invite = store.invites.find((i) => i.secret === body.inviteSecret);
    if (!invite) return c.json({ error: "Unknown coder; a valid invite is needed" }, 401);
    if (invite.auth === "required") return c.json({ error: "This invite requires login", code: "auth_required" }, 401);

    // A participant id is a label, never a credential: a new key for a known
    // participant gets a *new* session, and only when asked for.
    const participantId = invite.participantId ?? (invite.participantFromUrl ? body.participantId : undefined);
    const knownParticipant = participantId !== undefined && store.coders.some((c) => c.participantId === participantId);
    if (knownParticipant && !body.newSession) {
      return c.json({ error: "This participant already has a session", code: "participant_has_session" }, 409);
    }
    if (!knownParticipant) {
      if (invite.maxUses !== undefined && invite.uses >= invite.maxUses) return c.json({ error: "Invite used up" }, 401);
      invite.uses++;
    }

    const coder: Coder = { id: store.coders.length + 1, key: body.coderKey, participantId, assignments: {} };
    store.coders.push(coder);
    // Preset values for the codebook's `auto` variables with source "invite".
    upsert(
      null,
      coder.id,
      Object.fromEntries(
        Object.entries(invite.variables).map(([name, code]) => [name, { done: true, skip: false, codes: [{ code }] }]),
      ),
    );
    return c.json(toBackendCoder(coder));
  });

  api.put("/coders/:coderId", async (c) => {
    const body = await parse(c, BackendCoderWriteSchema);
    if (!body) return c.json({ error: "Invalid body" }, 400);
    const coder = store.coders.find((x) => x.id === Number(c.req.param("coderId")));
    if (!coder) return c.json({ error: "Coder not found" }, 404);
    // Full replace: upsert the given values, retire the others.
    const now = new Date();
    for (const v of store.values) {
      if (live(v) && v.unitId === null && v.coderId === coder.id && !(v.variable in body.variables)) v.retiredAt = now;
    }
    upsert(null, coder.id, body.variables);
    coder.assignments = body.assignments;
    return c.body(null, 204);
  });

  // One coder's live values, per unit, ordered by first write.
  api.get("/annotations", (c) => {
    const coderId = Number(c.req.query("coderId"));
    if (!coderId) return c.json({ error: "coderId is required" }, 400);
    const byUnit = new Map<number, BackendAnnotation>();
    for (const v of [...store.values].filter((v) => live(v) && v.coderId === coderId).sort(byCreated)) {
      if (v.unitId === null) continue; // coder-level: returned with the coder
      const a = byUnit.get(v.unitId) ?? { unitId: v.unitId, coderId, variables: {}, created: v.created, updated: v.updated };
      a.variables[v.variable] = v.value;
      if (v.updated > a.updated) a.updated = v.updated;
      byUnit.set(v.unitId, a);
    }
    return c.json([...byUnit.values()]);
  });

  // The job server's buffered writes, in order: upsert a live value per
  // given variable, leave other variables alone. Writes for unknown units or
  // coders are skipped and reported, so they don't block the rest.
  api.post("/annotations", async (c) => {
    const body = await parse(c, BackendAnnotationBatchSchema);
    if (!body) return c.json({ error: "Invalid body" }, 400);
    const rejected: { index: number; error: string }[] = [];
    body.annotations.forEach((a, index) => {
      if (!store.units.has(a.unitId)) return rejected.push({ index, error: "Unit not found" });
      if (!store.coders.some((x) => x.id === a.coderId)) return rejected.push({ index, error: "Coder not found" });
      // Stored as given, never refused: a `unitHash` other than the unit's
      // current hash means the coder saw older content.
      upsert(a.unitId, a.coderId, a.variables, { codebookId: a.codebookId, unitHash: a.unitHash });
    });
    return c.json({ rejected });
  });

  // Per group of variables: the (unit, coder) pairs -- or, for coder-level
  // groups, the coders -- where every variable is live ("finished").
  // Filtering only; the job server decides the groups and does the counting.
  api.post("/finished", async (c) => {
    const body = await parse(c, FinishedRequestSchema);
    if (!body) return c.json({ error: "Invalid body" }, 400);
    const result: BackendFinished[] = [];
    for (const group of body.loops) {
      const variables = new Set(group.variables);
      const coderLevel = group.level === "coder";
      const pairs = new Map<string, Value[]>();
      for (const v of store.values) {
        if (!live(v) || !variables.has(v.variable) || (v.unitId === null) !== coderLevel) continue;
        if (body.coderId !== undefined && v.coderId !== body.coderId) continue;
        const key = `${v.unitId}/${v.coderId}`;
        pairs.set(key, [...(pairs.get(key) ?? []), v]);
      }
      const finished = [...pairs.values()]
        .filter((values) => values.length === variables.size)
        .map((values) => ({ values, created: new Date(Math.min(...values.map((v) => v.created.getTime()))) }))
        .sort((a, b) => a.created.getTime() - b.created.getTime() || (a.values[0].unitId ?? 0) - (b.values[0].unitId ?? 0));
      for (const { values, created } of finished) {
        const { unitId, coderId } = values[0];
        const row: BackendFinished = { loop: group.loop, unitId, coderId, created };
        if (group.values?.length) {
          row.values = Object.fromEntries(
            store.values
              .filter((v) => live(v) && v.unitId === unitId && v.coderId === coderId && group.values!.includes(v.variable))
              .map((v) => [v.variable, v.value]),
          );
        }
        result.push(row);
      }
    }
    return c.json(result);
  });

  app.route("/backend/job/:jobId", api);
  return app;
}

const byCreated = (a: Value, b: Value) => a.created.getTime() - b.created.getTime();

async function parse<T>(c: Context, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }) {
  try {
    const parsed = schema.safeParse(await c.req.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
