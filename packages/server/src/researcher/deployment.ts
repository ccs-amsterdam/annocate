import { Hono } from "hono";
import { DeploymentWriteSchema, deployErrors, own, redirectSettings, undeclaredFields } from "@annotinder/contracts";
import { designVersionItems, designVersionUnits, itemsValid } from "../shared/designVersions.js";
import { and, eq } from "drizzle-orm";
import { deployments, designVersions, studies } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { deploymentVersions, getDeployment, pendingChanges, putDeployment } from "../shared/deployments.js";
import { checkLinkCount, syncLinks } from "../shared/links.js";
import { assignmentChecks } from "../shared/deployChecks.js";
import { parseJson } from "../shared/request.js";
import { studyCoderKind } from "../shared/coderKind.js";

export function deployment(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/deployment", requireStudyUser(server, "READ"), async (c) =>
    c.json(await getDeployment(db, c.get("studyId"))),
  );
  app.get("/study/:studyId/deployment/pending", requireStudyUser(server, "READ"), async (c) =>
    c.json(await pendingChanges(db, c.get("studyId"))),
  );
  app.get("/study/:studyId/deployment/versions", requireStudyUser(server, "READ"), async (c) =>
    c.json(await deploymentVersions(db, c.get("studyId"))),
  );

  app.put("/study/:studyId/deployment", requireStudyUser(server, "ADMIN"), async (c) => {
    const body = await parseJson(c, DeploymentWriteSchema);

    const studyId = c.get("studyId");
    const [version] = await db
      .select()
      .from(designVersions)
      .where(and(eq(designVersions.studyId, studyId), eq(designVersions.id, body.designVersionId)));
    if (!version) return c.json({ error: "Design version not found" }, 404);
    const items = designVersionItems(version);
    const fields = designVersionUnits(version).fields;
    // Drafts may be saved with issues; coders only ever get a valid design version, with who codes chosen:
    // for the study's kind of coders, once its first deploy fixed it.
    const coderKind = await studyCoderKind(db, studyId);
    const errors = deployErrors(items, coderKind);
    if (errors.length > 0 || !itemsValid(items, coderKind)) {
      return c.json({ error: "Fix the design's issues before deploying it", issues: errors }, 400);
    }
    // The unit fields it uses must be declared (docs/architecture.md §8.4)
    const undeclared = undeclaredFields(items, fields);
    if (undeclared.length > 0) {
      return c.json(
        {
          error: `The design uses unit fields it doesn't declare: ${undeclared.join(", ")}`,
          code: "undeclared_fields",
        },
        400,
      );
    }
    // The units it runs: the drafts (`units`, and always the first time), or the deployed ones.
    const deployed = (await db.$count(deployments, eq(deployments.studyId, studyId))) > 0;
    const live = !body.units && deployed;
    // Who gets which units: the columns with a role (docs/plans/unit-sets.md)
    const checks = await assignmentChecks(db, studyId, items, live);
    if (checks.errors.length > 0) return c.json({ error: checks.errors.join(" "), code: "assignment_invalid" }, 400);
    // Links follow the design's coder unit assignment (docs/architecture.md §7).
    await checkLinkCount(db, studyId, items, body.confirmLinks ?? false, live);
    const result = await db.transaction(async (tx) => {
      const deployment = await putDeployment(tx, studyId, body);
      const [study] = await tx
        .select({ redirectUrls: studies.redirectUrls })
        .from(studies)
        .where(eq(studies.id, studyId));
      // Panel return links are deployment settings: say which ones are missing
      const unset = redirectSettings(items).filter((name) => !own(study?.redirectUrls, name));
      const warnings = [
        ...(deployment.warnings ?? []),
        ...checks.warnings,
        ...unset.map(
          (name) =>
            `End items send coders on with the setting '${name}', which has no URL yet: set it in the study's Settings.`,
        ),
      ];
      return { ...deployment, links: await syncLinks(tx, studyId), ...(warnings.length > 0 ? { warnings } : {}) };
    });
    await server.deployments.bumpRevision(studyId);
    return c.json(result);
  });

  return app;
}
