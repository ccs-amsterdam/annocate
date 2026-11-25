import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { HttpError } from "../shared/http.js";
import { idParam, parseJson } from "../shared/request.js";
import { AdminStudyUpdateSchema } from "@annotinder/contracts";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { studies, users } from "../db/schema/index.js";
import { accountRole } from "../db/sql.js";
import { adminLogger, selectStudies } from "../shared/adminQueries.js";

/** Every study on the server, with its owner and size: a new owner, suspending. Never its data. */
export function adminStudies(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  const log = adminLogger(db);

  app.get("/admin/studies", async (c) => c.json(await selectStudies(db).orderBy(desc(studies.id))));

  app.put("/admin/studies/:id", async (c) => {
    const id = idParam(c, "id");
    const update = await parseJson(c, AdminStudyUpdateSchema);
    const [study] = await db.select({ name: studies.name }).from(studies).where(eq(studies.id, id));
    if (!study) throw new HttpError(404, "Study not found");
    if (update.owner !== undefined) {
      const [owner] = await db
        .select({ id: users.id, role: accountRole(users.id) })
        .from(users)
        .where(and(eq(users.email, update.owner.toLowerCase()), isNotNull(users.registeredAt)))
        .orderBy(sql`${users.lastLoginAt} DESC NULLS LAST`)
        .limit(1);
      if (!owner || owner.role === "user")
        throw new HttpError(400, "The new owner must be a researcher on this server");
      await db.update(studies).set({ ownerId: owner.id }).where(eq(studies.id, id));
    }
    if (update.suspended !== undefined) {
      await db
        .update(studies)
        .set({ suspendedAt: update.suspended ? sql`COALESCE(${studies.suspendedAt}, now())` : null })
        .where(eq(studies.id, id));
      // Coders are refused from now on (the runtime loads again, runtime/store.ts).
      server.deployments.drop(id);
    }
    await log(
      c,
      update.suspended === true ? "suspend study" : update.suspended === false ? "resume study" : "update study",
      `#${id} ${study.name}`,
      update,
    );
    const [updated] = await selectStudies(db).where(eq(studies.id, id));
    return c.json(updated!);
  });

  return app;
}
