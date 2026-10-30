import { Hono } from "hono";
import { CodebookItemsSchema, SetGroupWriteSchema, branchGroups, setParameters, unitLoops, type CodebookItem } from "@annotinder/contracts";
import type { Sql } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { deleteSetGroup, listSetGroups, putSetGroup } from "../shared/sets.js";
import { syncLinks } from "../shared/invites.js";

/** Whether the published or latest codebook uses a group (a loop's set, or a link or URL parameter's values). */
async function groupInUse(sql: Sql, jobId: number, group: string): Promise<boolean> {
  const rows = await sql.query<{ items: unknown }>(
    `SELECT items FROM codebooks WHERE job_id = $1 AND (id = (SELECT codebook_id FROM deployments WHERE job_id = $1)
       OR id = (SELECT max(id) FROM codebooks WHERE job_id = $1))`,
    [jobId],
  );
  return rows.some((row) => {
    const parsed = CodebookItemsSchema.safeParse(row.items);
    if (!parsed.success) return false;
    const items = parsed.data as CodebookItem[];
    const loops = unitLoops(items).some(({ loop }) => loop.units.some((b) => branchGroups(b).includes(group)));
    return loops || [...setParameters(items).values()].includes(group);
  });
}

// Set groups (docs/plans/sets-and-session-parameters.md §1). A change applies
// to running jobs at once (no new codebook version), and links follow it.
export function sets(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/sets", requireJobUser(server, "READ"), async (c) => c.json(await listSetGroups(db, c.get("jobId"))));

  app.put("/job/:jobId/sets/:group", requireJobUser(server, "WRITE"), async (c) => {
    const parsed = SetGroupWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const group = c.req.param("group")!;
    await db.transaction(async (tx) => {
      await putSetGroup(tx, jobId, group, parsed.data.sets);
      await syncLinks(tx, jobId);
    });
    await server.deployments.refresh(jobId);
    const stored = (await listSetGroups(db, jobId)).find((g) => g.name === group) ?? { name: group, sets: [] };
    return c.json(stored);
  });

  app.delete("/job/:jobId/sets/:group", requireJobUser(server, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const group = c.req.param("group")!;
    if (await groupInUse(db, jobId, group)) return c.json({ error: `The codebook uses group '${group}': change it first` }, 409);
    const deleted = await db.transaction(async (tx) => {
      const found = await deleteSetGroup(tx, jobId, group);
      if (found) await syncLinks(tx, jobId);
      return found;
    });
    if (!deleted) return c.json({ error: "Group not found" }, 404);
    await server.deployments.refresh(jobId);
    return c.body(null, 204);
  });

  return app;
}
