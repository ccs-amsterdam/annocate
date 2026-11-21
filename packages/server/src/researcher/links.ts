import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { LinkWriteSchema } from "@annotinder/contracts";
import { and, asc, eq, sql } from "drizzle-orm";
import { links as linksTable } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { forgetLink, toLinkResponse } from "../shared/links.js";

// Links (docs/architecture.md §7): made from the
// deployed design version (shared/links.ts `syncLinks`); here only their access
// settings, revoking, and a new secret.
/** A study's link, by id (from the path). */
const link = (studyId: number, id: string | undefined) =>
  and(eq(linksTable.studyId, studyId), eq(linksTable.id, Number(id)));

export function links(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/links", requireStudyUser(server, "WRITE"), async (c) => {
    const rows = await db
      .select()
      .from(linksTable)
      .where(eq(linksTable.studyId, c.get("studyId")))
      .orderBy(sql`${linksTable.retiredAt} IS NOT NULL`, asc(linksTable.id));
    return c.json(rows.map(toLinkResponse));
  });

  app.put("/study/:studyId/links/:id", requireStudyUser(server, "WRITE"), async (c) => {
    const parsed = LinkWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { label, maxUses, coder } = parsed.data;
    const [row] = await db
      .update(linksTable)
      .set({ label, maxUses: maxUses ?? null, coder: coder ?? null })
      .where(link(c.get("studyId"), c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Link not found" }, 404);
    forgetLink(row.secret);
    return c.json(toLinkResponse(row));
  });

  // No new coders from this link; coders who already started keep working.
  app.post("/study/:studyId/links/:id/revoke", requireStudyUser(server, "WRITE"), async (c) => {
    const [row] = await db
      .update(linksTable)
      .set({ revokedAt: sql`COALESCE(${linksTable.revokedAt}, now())` })
      .where(link(c.get("studyId"), c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Link not found" }, 404);
    return c.json(toLinkResponse(row));
  });

  // Open to new coders again (undoes a revoke)
  app.post("/study/:studyId/links/:id/reopen", requireStudyUser(server, "WRITE"), async (c) => {
    const [row] = await db
      .update(linksTable)
      .set({ revokedAt: null })
      .where(link(c.get("studyId"), c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Link not found" }, 404);
    return c.json(toLinkResponse(row));
  });

  // A new secret: the old link stops working (e.g. it was shared too widely); sessions that started go on.
  app.post("/study/:studyId/links/:id/secret", requireStudyUser(server, "WRITE"), async (c) => {
    const [old] = await db
      .select()
      .from(linksTable)
      .where(link(c.get("studyId"), c.req.param("id")));
    if (!old) return c.json({ error: "Link not found" }, 404);
    const [row] = await db
      .update(linksTable)
      .set({ secret: randomBytes(16).toString("hex") })
      .where(eq(linksTable.id, old.id))
      .returning();
    forgetLink(old.secret);
    return c.json(toLinkResponse(row!));
  });

  return app;
}
