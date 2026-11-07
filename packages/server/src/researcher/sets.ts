import { Hono } from "hono";
import { DesignItemsSchema, SetGroupWriteSchema, branchGroups, setParameters, unitLoops, type DesignItem } from "@annotinder/contracts";
import type { Sql } from "../db.js";
import type { Server, Env } from "../context.js";
import { designVersionItems } from "../shared/designVersions.js";
import { requireStudyUser } from "./auth.js";
import { deleteSetGroup, listSetGroups, putSetGroup } from "../shared/sets.js";

/** Whether the deployed or latest codebook uses a group (a loop's set, or a link or URL parameter's values). */
async function groupInUse(sql: Sql, studyId: number, group: string): Promise<boolean> {
  const rows = await sql.query<{ items: unknown; session: unknown }>(
    `SELECT items, session FROM design_versions WHERE study_id = $1 AND (id = (SELECT design_version_id FROM deployments WHERE study_id = $1)
       OR id = (SELECT max(id) FROM design_versions WHERE study_id = $1))`,
    [studyId],
  );
  return rows.some((row) => {
    const parsed = DesignItemsSchema.safeParse(designVersionItems(row));
    if (!parsed.success) return false;
    const items = parsed.data as DesignItem[];
    const loops = unitLoops(items).some(({ loop }) => loop.units.some((b) => branchGroups(b).includes(group)));
    return loops || [...setParameters(items).values()].includes(group);
  });
}

// Set groups (docs/plans/sets-and-session-parameters.md §1): the draft's.
// Coders and links get them when they are deployed (docs/plans/design.md §5).
export function sets(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  // ?live=true: the deployed sets (what links and coders get)
  app.get("/study/:studyId/sets", requireStudyUser(server, "READ"), async (c) => c.json(await listSetGroups(db, c.get("studyId"), c.req.query("live") === "true")));

  app.put("/study/:studyId/sets/:group", requireStudyUser(server, "WRITE"), async (c) => {
    const parsed = SetGroupWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const studyId = c.get("studyId");
    const group = c.req.param("group")!;
    await db.transaction((tx) => putSetGroup(tx, studyId, group, parsed.data.sets));
    const stored = (await listSetGroups(db, studyId)).find((g) => g.name === group) ?? { name: group, sets: [] };
    return c.json(stored);
  });

  app.delete("/study/:studyId/sets/:group", requireStudyUser(server, "WRITE"), async (c) => {
    const studyId = c.get("studyId");
    const group = c.req.param("group")!;
    if (await groupInUse(db, studyId, group)) return c.json({ error: `The design uses group '${group}': change it first` }, 409);
    const deleted = await db.transaction((tx) => deleteSetGroup(tx, studyId, group));
    if (!deleted) return c.json({ error: "Group not found" }, 404);
    return c.body(null, 204);
  });

  return app;
}
