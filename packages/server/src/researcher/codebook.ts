import { Hono } from "hono";
import { CodebookWriteSchema, sessionItem } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toCodebookMeta, toCodebookResponse, type CodebookRow } from "../shared/codebooks.js";
import { getUnitFields } from "../shared/units.js";

export function codebooks(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/codebook", requireJobUser(server, "READ"), async (c) => {
    const rows = await db.query<CodebookRow>("SELECT * FROM codebooks WHERE job_id = $1 ORDER BY id", [c.get("jobId")]);
    return c.json(rows.map(toCodebookMeta));
  });

  app.post("/job/:jobId/codebook", requireJobUser(server, "WRITE"), async (c) => {
    const parsed = CodebookWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    if (sessionItem(parsed.data.items)) return c.json({ error: "The session goes in `session`, not among the items" }, 400);
    // The unit fields, unless given: the latest version's (docs/plans/design.md §3)
    const units = parsed.data.units ?? (await getUnitFields(db, c.get("jobId")).then((fields) => ({ fields })));
    const row = await one<CodebookRow>(
      db,
      "INSERT INTO codebooks (job_id, note, items, units, session, updated_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [
        c.get("jobId"),
        parsed.data.note ?? null,
        JSON.stringify(parsed.data.items),
        JSON.stringify(units),
        parsed.data.session ? JSON.stringify(parsed.data.session) : null,
        c.get("jobUser")?.email ?? null,
      ],
    );
    return c.json(toCodebookResponse(row!), 201);
  });

  return app;
}
