import { Hono } from "hono";
import { DesignWriteSchema, EMPTY_SESSION, sessionItem } from "@annotinder/contracts";
import { asc, eq } from "drizzle-orm";
import { designVersions as versions } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { toDesignVersionMeta, toDesignVersion } from "../shared/designVersions.js";
import { getUnitFields } from "../shared/units.js";

export function designVersions(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/design", requireStudyUser(server, "READ"), async (c) => {
    const rows = await db.select().from(versions).where(eq(versions.studyId, c.get("studyId"))).orderBy(asc(versions.id));
    return c.json(rows.map(toDesignVersionMeta));
  });

  app.post("/study/:studyId/design", requireStudyUser(server, "WRITE"), async (c) => {
    const parsed = DesignWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    if (sessionItem(parsed.data.items)) return c.json({ error: "The session and public info go in `session` and `public`, not among the items" }, 400);
    // The unit fields, unless given: the latest version's (docs/plans/design.md §3)
    const units = parsed.data.units ?? (await getUnitFields(db, c.get("studyId")).then((fields) => ({ fields })));
    const [row] = await db
      .insert(versions)
      .values({
        studyId: c.get("studyId"),
        note: parsed.data.note ?? null,
        items: parsed.data.items,
        units,
        session: parsed.data.session ?? EMPTY_SESSION,
        public: parsed.data.public ?? null,
        updatedBy: c.get("studyUser")?.email ?? null,
      })
      .returning();
    return c.json(toDesignVersion(row!), 201);
  });

  return app;
}
