import { Hono } from "hono";
import { DesignWriteSchema, EMPTY_SESSION, sessionItem } from "@annotinder/contracts";
import { asc, eq } from "drizzle-orm";
import { designVersions as versions } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { toDesignVersionMeta, toDesignVersion } from "../shared/designVersions.js";
import { getUnitFields } from "../shared/units.js";
import { parseJson } from "../shared/request.js";

export function designVersions(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/design", requireStudyUser(server, "READ"), async (c) => {
    const rows = await db
      .select()
      .from(versions)
      .where(eq(versions.studyId, c.get("studyId")))
      .orderBy(asc(versions.id));
    return c.json(rows.map(toDesignVersionMeta));
  });

  app.post("/study/:studyId/design", requireStudyUser(server, "WRITE"), async (c) => {
    const body = await parseJson(c, DesignWriteSchema);

    if (sessionItem(body.items))
      return c.json({ error: "The session and public info go in `session` and `public`, not among the items" }, 400);
    // The unit fields, unless given: the latest version's (docs/architecture.md §8.4)
    const units = body.units ?? (await getUnitFields(db, c.get("studyId")).then((fields) => ({ fields })));
    const [row] = await db
      .insert(versions)
      .values({
        studyId: c.get("studyId"),
        note: body.note ?? null,
        items: body.items,
        units,
        session: body.session ?? EMPTY_SESSION,
        public: body.public ?? null,
        updatedBy: c.get("studyUser")?.email ?? null,
      })
      .returning();
    return c.json(toDesignVersion(row!), 201);
  });

  return app;
}
