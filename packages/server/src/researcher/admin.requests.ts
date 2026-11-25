import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { HttpError } from "../shared/http.js";
import { idParam, parseJson } from "../shared/request.js";
import { ResearcherRequestDecisionSchema } from "@annotinder/contracts";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { researcherRequests, users } from "../db/schema/index.js";
import { accountRole } from "../db/sql.js";
import { setServerRole } from "../shared/accounts.js";
import { adminLogger } from "../shared/adminQueries.js";

/** Users asking to become a researcher, and the admin's decision. */
export function adminRequests(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  const log = adminLogger(db);

  app.get("/admin/requests", async (c) =>
    c.json(
      await db
        .select({
          userId: researcherRequests.userId,
          email: users.email,
          message: researcherRequests.message,
          at: researcherRequests.at,
        })
        .from(researcherRequests)
        .innerJoin(users, eq(users.id, researcherRequests.userId))
        .where(isNull(researcherRequests.decidedAt))
        .orderBy(asc(researcherRequests.at)),
    ),
  );

  app.post("/admin/requests/:userId", async (c) => {
    const userId = idParam(c, "userId");
    const { approve } = await parseJson(c, ResearcherRequestDecisionSchema);
    const [row] = await db
      .update(researcherRequests)
      .set({ decidedAt: sql`now()`, decidedBy: c.get("researcher").email, approved: approve })
      .from(users)
      .where(
        and(
          eq(researcherRequests.userId, userId),
          eq(users.id, researcherRequests.userId),
          isNull(researcherRequests.decidedAt),
        ),
      )
      .returning({ email: users.email, role: accountRole(users.id) });
    if (!row) throw new HttpError(404, "No open request from this user");
    if (approve && row.role === "user") {
      await setServerRole(db, userId, "researcher", c.get("researcher").email);
    }
    await log(c, approve ? "approve request" : "deny request", row.email);
    return c.body(null, 204);
  });

  return app;
}
