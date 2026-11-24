import { Hono } from "hono";
import { SetGroupWriteSchema, designSetColumns } from "@annotinder/contracts";
import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deployments, designVersions } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { designVersionItems } from "../shared/designVersions.js";
import { requireStudyUser } from "./auth.js";
import { deleteSetGroup, listSetGroups, putSetGroup } from "../shared/sets.js";
import { parseJson } from "../shared/request.js";

/** Whether the deployed or latest design selects units by a column (`designSetColumns`). */
async function groupInUse(db: Db, studyId: number, group: string): Promise<boolean> {
  const deployed = db
    .select({ id: deployments.designVersionId })
    .from(deployments)
    .where(eq(deployments.studyId, studyId));
  const latest = db
    .select({ id: sql`max(${designVersions.id})` })
    .from(designVersions)
    .where(eq(designVersions.studyId, studyId));
  const rows = await db
    .select({ items: designVersions.items, session: designVersions.session })
    .from(designVersions)
    .where(
      and(eq(designVersions.studyId, studyId), or(eq(designVersions.id, deployed), eq(designVersions.id, latest))),
    );
  return rows.some((row) => (designSetColumns(designVersionItems(row)) as string[]).includes(group));
}

// The columns with a role (docs/plans/unit-sets.md), stored as sets: the draft's.
// Coders and links get them when they are deployed (docs/architecture.md §8.4).
export function sets(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  // ?live=true: the deployed sets (what links and coders get)
  app.get("/study/:studyId/sets", requireStudyUser(server, "READ"), async (c) =>
    c.json(await listSetGroups(db, c.get("studyId"), c.req.query("live") === "true")),
  );

  app.put("/study/:studyId/sets/:group", requireStudyUser(server, "WRITE"), async (c) => {
    const body = await parseJson(c, SetGroupWriteSchema);
    const studyId = c.get("studyId");
    const group = c.req.param("group")!;
    await db.transaction((tx) => putSetGroup(tx, studyId, group, body.sets));
    const stored = (await listSetGroups(db, studyId)).find((g) => g.name === group) ?? { name: group, sets: [] };
    return c.json(stored);
  });

  app.delete("/study/:studyId/sets/:group", requireStudyUser(server, "WRITE"), async (c) => {
    const studyId = c.get("studyId");
    const group = c.req.param("group")!;
    if (await groupInUse(db, studyId, group))
      return c.json({ error: `The design uses column '${group}': change it first` }, 409);
    const deleted = await db.transaction((tx) => deleteSetGroup(tx, studyId, group));
    if (!deleted) return c.json({ error: "Group not found" }, 404);
    return c.body(null, 204);
  });

  return app;
}
