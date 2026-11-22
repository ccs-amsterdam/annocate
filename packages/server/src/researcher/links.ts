import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import { links as linksTable } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { deployedSession, forgetLink, toLinkResponse, type LinkRow } from "../shared/links.js";

// Links (docs/architecture.md §7): made from the deployed design version
// (shared/links.ts `syncLinks`), with the design's settings; here only
// revoking and reopening, and a new secret.

/** A study's link, by id (from the path). */
const linkWhere = (studyId: number, id: string | undefined) =>
  and(eq(linksTable.studyId, studyId), eq(linksTable.id, Number(id)));

export function links(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  const respond = async (row: LinkRow) => Response.json(toLinkResponse(row, await deployedSession(db, row.studyId)));

  app.get("/study/:studyId/links", requireStudyUser(server, "WRITE"), async (c) => {
    const rows = await db
      .select()
      .from(linksTable)
      .where(eq(linksTable.studyId, c.get("studyId")))
      .orderBy(sql`${linksTable.retiredAt} IS NOT NULL`, asc(linksTable.id));
    const session = await deployedSession(db, c.get("studyId"));
    return c.json(rows.map((row) => toLinkResponse(row, session)));
  });

  // No new coders from this link; coders who already started keep working.
  app.post("/study/:studyId/links/:id/revoke", requireStudyUser(server, "WRITE"), async (c) => {
    const [row] = await db
      .update(linksTable)
      .set({ revokedAt: sql`COALESCE(${linksTable.revokedAt}, now())` })
      .where(linkWhere(c.get("studyId"), c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Link not found" }, 404);
    return respond(row);
  });

  // Open to new coders again (undoes a revoke)
  app.post("/study/:studyId/links/:id/reopen", requireStudyUser(server, "WRITE"), async (c) => {
    const [row] = await db
      .update(linksTable)
      .set({ revokedAt: null })
      .where(linkWhere(c.get("studyId"), c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Link not found" }, 404);
    return respond(row);
  });

  // A new secret: the old link stops working (e.g. it was shared too widely); sessions that started go on.
  app.post("/study/:studyId/links/:id/secret", requireStudyUser(server, "WRITE"), async (c) => {
    const [old] = await db
      .select()
      .from(linksTable)
      .where(linkWhere(c.get("studyId"), c.req.param("id")));
    if (!old) return c.json({ error: "Link not found" }, 404);
    const [row] = await db
      .update(linksTable)
      .set({ secret: randomBytes(16).toString("hex") })
      .where(eq(linksTable.id, old.id))
      .returning();
    forgetLink(old.secret);
    return respond(row!);
  });

  return app;
}
