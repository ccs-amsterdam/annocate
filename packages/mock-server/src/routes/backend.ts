import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  BackendAnnotationWriteSchema,
  BackendCoderVariablesWriteSchema,
  ResolveCoderRequestSchema,
  type BackendAnnotation,
  type BackendUnit,
  type ResolveCoderResponse,
} from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobServer, resolveCoder } from "../auth.js";
import { listAnnotations, putAnnotation } from "../db/annotations.js";
import { getDeploymentSpec } from "../db/deployments.js";

// The backend API (contracts `backendEndpoints`): what a db server exposes to
// the job server. The job server holds no state of its own that it can't
// rebuild from these endpoints (docs/architecture.md).

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
    const units: BackendUnit[] = rows.map((r) => ({ id: r.id, externalId: r.externalId, data: JSON.parse(r.data) }));
    return c.json(units);
  });

  app.post("/coders/resolve", async (c) => {
    const parsed = ResolveCoderRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const coder = resolveCoder(db, parsed.data.coderKey, parsed.data.inviteSecret, c.get("jobId"));
    if ("error" in coder) return c.json({ error: coder.error }, 401);
    const response: ResolveCoderResponse = { coderId: coder.id, variables: JSON.parse(coder.variables) };
    return c.json(response);
  });

  app.put("/coders/:coderId/variables", async (c) => {
    const parsed = BackendCoderVariablesWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const result = db
      .prepare("UPDATE coders SET variables = ? WHERE jobId = ? AND id = ?")
      .run(JSON.stringify(parsed.data.variables), c.get("jobId"), Number(c.req.param("coderId")));
    if (result.changes === 0) return c.json({ error: "Coder not found" }, 404);
    return c.body(null, 204);
  });

  // TODO: paginate (`?after=<cursor>`) once jobs get large enough for a
  // full dump on job-server cold start to matter.
  app.get("/annotations", (c) => {
    const annotations: BackendAnnotation[] = listAnnotations(db, c.get("jobId")).map((row) => ({
      unitId: row.unitId,
      coderId: row.coderId,
      variables: JSON.parse(row.variables),
      updated: new Date(row.updated),
    }));
    return c.json(annotations);
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
    putAnnotation(db, jobId, unitId, coderId, parsed.data.variables);
    return c.body(null, 204);
  });

  return app;
}
