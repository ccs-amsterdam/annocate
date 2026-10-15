import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  BackendAnnotationWriteSchema,
  BackendCoderWriteSchema,
  FinishedRequestSchema,
  ResolveCoderRequestSchema,
  type BackendCoder,
  type BackendUnit,
} from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobServer, resolveCoder, type CoderRow } from "../auth.js";
import { listCoderAnnotations, listFinished, putAnnotation } from "../db/annotations.js";
import { unitHash } from "../db/units.js";
import { getDeploymentSpec } from "../db/deployments.js";

// The backend API (contracts `backendEndpoints`): what a db server exposes to
// the job server. The job server holds no state of its own that it can't
// rebuild from these endpoints (docs/architecture.md).

function toBackendCoder(row: CoderRow): BackendCoder {
  return { coderId: row.id, variables: JSON.parse(row.variables), assignments: JSON.parse(row.assignments) };
}

export function backendRoutes(db: DatabaseSync, secret: string) {
  const app = new Hono<HonoEnv>();
  app.use("*", requireJobServer(db, secret));

  app.get("/deployment", (c) => {
    const spec = getDeploymentSpec(db, c.get("jobId"));
    if (!spec) return c.json({ error: "Job is not deployed" }, 404);
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

  app.put("/annotations/:unitId/:coderId", async (c) => {
    const parsed = BackendAnnotationWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const unitId = Number(c.req.param("unitId"));
    const coderId = Number(c.req.param("coderId"));
    // The job server validated the annotation against the codebook; the db
    // server only checks the shape (above) and referential integrity.
    if (!db.prepare("SELECT 1 FROM units WHERE jobId = ? AND id = ?").get(jobId, unitId)) {
      return c.json({ error: "Unit not found" }, 404);
    }
    if (!db.prepare("SELECT 1 FROM coders WHERE jobId = ? AND id = ?").get(jobId, coderId)) {
      return c.json({ error: "Coder not found" }, 404);
    }
    putAnnotation(db, jobId, unitId, coderId, parsed.data.variables, parsed.data.codebookId, parsed.data.unitHash);
    return c.body(null, 204);
  });

  return app;
}
