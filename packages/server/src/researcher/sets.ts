import { Hono } from "hono";
import { SetGroupWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { deleteSetGroup, groupInUse, listSetGroups, putSetGroup } from "../shared/sets.js";
import { parseJson } from "../shared/request.js";

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
