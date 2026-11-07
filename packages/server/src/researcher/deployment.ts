import { Hono } from "hono";
import { DeploymentWriteSchema, designErrors, redirectSettings, undeclaredFields } from "@annotinder/contracts";
import { designVersionItems, designVersionUnits, itemsValid, type DesignVersionRow } from "../shared/designVersions.js";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { deploymentVersions, getDeployment, pendingChanges, putDeployment } from "../shared/deployments.js";
import { checkLinkCount, syncLinks } from "../shared/links.js";
import { setWarnings } from "../shared/sets.js";

export function deployment(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/deployment", requireStudyUser(server, "READ"), async (c) => c.json(await getDeployment(db, c.get("studyId"))));
  app.get("/study/:studyId/deployment/pending", requireStudyUser(server, "READ"), async (c) => c.json(await pendingChanges(db, c.get("studyId"))));
  app.get("/study/:studyId/deployment/versions", requireStudyUser(server, "READ"), async (c) => c.json(await deploymentVersions(db, c.get("studyId"))));

  app.put("/study/:studyId/deployment", requireStudyUser(server, "ADMIN"), async (c) => {
    const parsed = DeploymentWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const studyId = c.get("studyId");
    const codebook = await one<DesignVersionRow>(db, "SELECT * FROM design_versions WHERE study_id = $1 AND id = $2", [studyId, parsed.data.designVersionId]);
    if (!codebook) return c.json({ error: "Design version not found" }, 404);
    // Drafts may be saved with issues; coders only ever get a valid codebook.
    const errors = designErrors(designVersionItems(codebook));
    if (errors.length > 0 || !itemsValid(designVersionItems(codebook))) {
      return c.json({ error: "Fix the design's issues before deploying it", issues: errors }, 400);
    }
    // The unit fields it uses must be declared (docs/plans/design.md §3)
    const undeclared = undeclaredFields(designVersionItems(codebook), designVersionUnits(codebook).fields);
    if (undeclared.length > 0) {
      return c.json({ error: `The design uses unit fields it doesn't declare: ${undeclared.join(", ")}`, code: "undeclared_fields" }, 400);
    }
    // The units it runs: the drafts (`units`, and always the first time), or the deployed ones.
    const current = await one(db, "SELECT 1 FROM deployments WHERE study_id = $1", [studyId]);
    const live = !parsed.data.units && !!current;
    // Links follow the codebook's link parameters (docs/plans/sets-and-session-parameters.md §4).
    await checkLinkCount(db, studyId, designVersionItems(codebook), parsed.data.confirmLinks ?? false, live);
    const deployed = await db.transaction(async (tx) => {
      const result = await putDeployment(tx, studyId, parsed.data);
      const study = await one<{ redirect_urls: Record<string, string> }>(tx, "SELECT redirect_urls FROM studies WHERE id = $1", [studyId]);
      // Panel return links are deployment settings: say which ones are missing
      const unset = redirectSettings(designVersionItems(codebook)).filter((name) => !study?.redirect_urls?.[name]);
      const warnings = [
        ...(result.warnings ?? []),
        ...(await setWarnings(tx, studyId, designVersionItems(codebook), live)),
        ...unset.map((name) => `End items send coders on with the setting '${name}', which has no URL yet: set it in the study's Settings.`),
      ];
      return { ...result, links: await syncLinks(tx, studyId), ...(warnings.length > 0 ? { warnings } : {}) };
    });
    await server.deployments.refresh(studyId);
    return c.json(deployed);
  });

  return app;
}
