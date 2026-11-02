import { Hono } from "hono";
import { DeploymentWriteSchema, designErrors, redirectSettings, undeclaredFields } from "@annotinder/contracts";
import { designVersionItems, designVersionUnits, type DesignVersionRow } from "../shared/designVersions.js";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { deploymentVersions, getDeployment, pendingChanges, putDeployment } from "../shared/deployments.js";
import { checkLinkCount, syncLinks } from "../shared/links.js";
import { setWarnings } from "../shared/sets.js";

export function deployment(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/deployment", requireJobUser(server, "READ"), async (c) => c.json(await getDeployment(db, c.get("jobId"))));
  app.get("/job/:jobId/deployment/pending", requireJobUser(server, "READ"), async (c) => c.json(await pendingChanges(db, c.get("jobId"))));
  app.get("/job/:jobId/deployment/versions", requireJobUser(server, "READ"), async (c) => c.json(await deploymentVersions(db, c.get("jobId"))));

  app.put("/job/:jobId/deployment", requireJobUser(server, "ADMIN"), async (c) => {
    const parsed = DeploymentWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const codebook = await one<DesignVersionRow>(db, "SELECT * FROM design_versions WHERE job_id = $1 AND id = $2", [jobId, parsed.data.designVersionId]);
    if (!codebook) return c.json({ error: "Design version not found" }, 404);
    // Drafts may be saved with issues; coders only ever get a valid codebook.
    const errors = designErrors(designVersionItems(codebook));
    if (errors.length > 0 || designVersionItems(codebook).length === 0) {
      return c.json({ error: "Fix the design's issues before deploying it", issues: errors }, 400);
    }
    // The unit fields it uses must be declared (docs/plans/design.md §3)
    const undeclared = undeclaredFields(designVersionItems(codebook), designVersionUnits(codebook).fields);
    if (undeclared.length > 0) {
      return c.json({ error: `The design uses unit fields it doesn't declare: ${undeclared.join(", ")}`, code: "undeclared_fields" }, 400);
    }
    // The units it runs: the drafts (`units`, and always the first time), or the deployed ones.
    const current = await one(db, "SELECT 1 FROM deployments WHERE job_id = $1", [jobId]);
    const live = !parsed.data.units && !!current;
    // Links follow the codebook's link parameters (docs/plans/sets-and-session-parameters.md §4).
    await checkLinkCount(db, jobId, designVersionItems(codebook), parsed.data.confirmLinks ?? false, live);
    const deployed = await db.transaction(async (tx) => {
      const result = await putDeployment(tx, jobId, parsed.data);
      const job = await one<{ redirect_urls: Record<string, string> }>(tx, "SELECT redirect_urls FROM jobs WHERE id = $1", [jobId]);
      // Panel return links are deployment settings: say which ones are missing
      const unset = redirectSettings(designVersionItems(codebook)).filter((name) => !job?.redirect_urls?.[name]);
      const warnings = [
        ...(result.warnings ?? []),
        ...(await setWarnings(tx, jobId, designVersionItems(codebook), live)),
        ...unset.map((name) => `End items send coders on with the setting '${name}', which has no URL yet: set it in the job's Settings.`),
      ];
      return { ...result, links: await syncLinks(tx, jobId), ...(warnings.length > 0 ? { warnings } : {}) };
    });
    await server.deployments.refresh(jobId);
    return c.json(deployed);
  });

  return app;
}
