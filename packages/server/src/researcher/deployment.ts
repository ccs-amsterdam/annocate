import { Hono } from "hono";
import { DeploymentWriteSchema, codebookErrors } from "@annotinder/contracts";
import { codebookItems, type CodebookRow } from "../shared/codebooks.js";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getDeployment, putDeployment } from "../shared/deployments.js";
import { checkLinkCount, syncLinks } from "../shared/invites.js";
import { setWarnings } from "../shared/sets.js";

export function deployment(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/deployment", requireJobUser(server, "READ"), async (c) => c.json(await getDeployment(db, c.get("jobId"))));

  app.put("/job/:jobId/deployment", requireJobUser(server, "ADMIN"), async (c) => {
    const parsed = DeploymentWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const codebook = await one<CodebookRow>(db, "SELECT * FROM codebooks WHERE job_id = $1 AND id = $2", [jobId, parsed.data.codebookId]);
    if (!codebook) return c.json({ error: "Codebook not found" }, 404);
    // Drafts may be saved with issues; coders only ever get a valid codebook.
    const errors = codebookErrors(codebookItems(codebook));
    if (errors.length > 0 || codebookItems(codebook).length === 0) {
      return c.json({ error: "Fix the codebook's issues before publishing it", issues: errors }, 400);
    }
    // Links follow the codebook's link parameters (docs/plans/sets-and-session-parameters.md §4).
    await checkLinkCount(db, jobId, codebookItems(codebook), parsed.data.confirmLinks ?? false);
    const deployed = await db.transaction(async (tx) => {
      const result = await putDeployment(tx, jobId, parsed.data);
      const warnings = [...(result.warnings ?? []), ...(await setWarnings(tx, jobId, codebookItems(codebook)))];
      return { ...result, links: await syncLinks(tx, jobId), ...(warnings.length > 0 ? { warnings } : {}) };
    });
    await server.deployments.refresh(jobId);
    return c.json(deployed);
  });

  return app;
}
