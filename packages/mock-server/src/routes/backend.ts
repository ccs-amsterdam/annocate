import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  BackendAnnotationBatchSchema,
  BackendCoderWriteSchema,
  FinishedRequestSchema,
  ResolveCoderRequestSchema,
  type BackendCoder,
  type BackendUnit,
  JobTokenRequestSchema,
} from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobToken, resolveCoder, type CoderRow } from "../auth.js";
import { listCoderAnnotations, listFinished, putAnnotation } from "../db/annotations.js";
import { unitHash } from "../db/units.js";
import { boundJobServer, getDeploymentSpec, getPreviewSpec } from "../db/deployments.js";
import type { JobTokenIssuer } from "@annotinder/reference-db-server/jobTokens";

// The backend API (contracts `backendEndpoints`): what a db server exposes to
// the job server. The job server holds no state of its own that it can't
// rebuild from these endpoints (docs/architecture.md).

function toBackendCoder(row: CoderRow): BackendCoder {
  return { coderId: row.id, variables: JSON.parse(row.variables), assignments: JSON.parse(row.assignments) };
}

export function backendRoutes(db: DatabaseSync, issuer: JobTokenIssuer, configuredJobServer: string | null) {
  const app = new Hono<HonoEnv>();

  // A job server asks for a job token with a request it signed (plan §13,
  // reference-db-server/src/jobTokens.ts). Before the job token check:
  // this is how a job server gets one.
  app.post("/token", async (c) => {
    const parsed = JobTokenRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
    const jobId = Number(c.req.param("jobId"));
    const bound = Number.isInteger(jobId) ? boundJobServer(db, jobId, configuredJobServer) : null;
    const result = await issuer.issue(jobId, parsed.data.assertion, bound);
    if ("error" in result) return c.json({ error: result.error }, result.status);
    return c.json(result);
  });

  app.use("*", requireJobToken(db, issuer, configuredJobServer));

  // `?preview=1`: the latest codebook, deployed or not (researcher previews).
  app.get("/deployment", (c) => {
    const preview = c.req.query("preview") === "1";
    const spec = preview ? getPreviewSpec(db, c.get("jobId")) : getDeploymentSpec(db, c.get("jobId"));
    if (!spec) return c.json({ error: preview ? "Job has no codebook" : "Job is not deployed" }, 404);
    return c.json(spec);
  });

  app.get("/units", (c) => {
    const ids = (c.req.query("ids") ?? "")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return c.json([]);
    const rows = db
      .prepare(`SELECT id, externalId, data FROM units WHERE jobId = ? AND id IN (${ids.map(() => "?").join(",")})`)
      .all(c.get("jobId"), ...ids) as unknown as { id: number; externalId: string; data: string }[];
    const units: BackendUnit[] = rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      data: JSON.parse(r.data),
      hash: unitHash(r.externalId, r.data),
    }));
    return c.json(units);
  });

  app.get("/coders", (c) => {
    const rows = db.prepare("SELECT * FROM coders WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as CoderRow[];
    return c.json(rows.map(toBackendCoder));
  });

  app.post("/coders/resolve", async (c) => {
    const parsed = ResolveCoderRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { coderKey, inviteSecret, participantId, newSession } = parsed.data;
    const coder = resolveCoder(db, coderKey, inviteSecret, c.get("jobId"), { participantId, newSession });
    if ("error" in coder) return c.json({ error: coder.error, code: coder.code }, coder.status);
    return c.json(toBackendCoder(coder));
  });

  app.put("/coders/:coderId", async (c) => {
    const parsed = BackendCoderWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const result = db
      .prepare("UPDATE coders SET variables = ?, assignments = ? WHERE jobId = ? AND id = ?")
      .run(
        JSON.stringify(parsed.data.variables),
        JSON.stringify(parsed.data.assignments),
        c.get("jobId"),
        Number(c.req.param("coderId")),
      );
    if (result.changes === 0) return c.json({ error: "Coder not found" }, 404);
    return c.body(null, 204);
  });

  // TODO: paginate (`?after=<cursor>`) `finished` and `annotations` once jobs
  // get large enough for it to matter.
  app.post("/finished", async (c) => {
    const parsed = FinishedRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    return c.json(listFinished(db, c.get("jobId"), parsed.data));
  });

  app.get("/annotations", (c) => {
    const coderId = Number(c.req.query("coderId"));
    if (!Number.isInteger(coderId) || coderId <= 0) return c.json({ error: "coderId is required" }, 400);
    return c.json(listCoderAnnotations(db, c.get("jobId"), coderId));
  });

  // The job server's buffered writes, applied in order (one transaction).
  app.post("/annotations", async (c) => {
    const parsed = BackendAnnotationBatchSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const unitExists = db.prepare("SELECT 1 FROM units WHERE jobId = ? AND id = ?");
    const coderExists = db.prepare("SELECT 1 FROM coders WHERE jobId = ? AND id = ?");
    const rejected: { index: number; error: string }[] = [];
    db.exec("BEGIN");
    try {
      parsed.data.annotations.forEach((a, index) => {
        // The job server validated the annotation against the codebook; the db
        // server only checks the shape (above) and referential integrity.
        if (!unitExists.get(jobId, a.unitId)) return rejected.push({ index, error: "Unit not found" });
        if (!coderExists.get(jobId, a.coderId)) return rejected.push({ index, error: "Coder not found" });
        putAnnotation(db, jobId, a.unitId, a.coderId, a.variables, a.codebookId, a.unitHash);
      });
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return c.json({ rejected });
  });

  return app;
}
