import { Hono } from "hono";
import { DesignWriteSchema, EMPTY_SESSION, sessionItem } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { toDesignVersionMeta, toDesignVersion, type DesignVersionRow } from "../shared/designVersions.js";
import { getUnitFields } from "../shared/units.js";

export function designVersions(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/design", requireStudyUser(server, "READ"), async (c) => {
    const rows = await db.query<DesignVersionRow>("SELECT * FROM design_versions WHERE study_id = $1 ORDER BY id", [c.get("studyId")]);
    return c.json(rows.map(toDesignVersionMeta));
  });

  app.post("/study/:studyId/design", requireStudyUser(server, "WRITE"), async (c) => {
    const parsed = DesignWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    if (sessionItem(parsed.data.items)) return c.json({ error: "The session and public info go in `session` and `public`, not among the items" }, 400);
    // The unit fields, unless given: the latest version's (docs/plans/design.md §3)
    const units = parsed.data.units ?? (await getUnitFields(db, c.get("studyId")).then((fields) => ({ fields })));
    const row = await one<DesignVersionRow>(
      db,
      "INSERT INTO design_versions (study_id, note, items, units, session, public, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [
        c.get("studyId"),
        parsed.data.note ?? null,
        JSON.stringify(parsed.data.items),
        JSON.stringify(units),
        JSON.stringify(parsed.data.session ?? EMPTY_SESSION),
        parsed.data.public ? JSON.stringify(parsed.data.public) : null,
        c.get("studyUser")?.email ?? null,
      ],
    );
    return c.json(toDesignVersion(row!), 201);
  });

  return app;
}
