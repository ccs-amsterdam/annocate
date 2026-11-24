import { Hono } from "hono";
import { StudyWriteSchema } from "@annotinder/contracts";
import { asc, isNotNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { roles, studies as studiesTable } from "../db/schema/index.js";
import { studyRole } from "../db/sql.js";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { toStudyResponse } from "../shared/studies.js";
import { effectiveLimits, usage } from "../shared/accounts.js";
import { HttpError } from "../shared/http.js";
import { parseJson } from "../shared/request.js";

// A server hosts any number of studies. A researcher (account role, see
// docs/accounts.md) may create one within their limits: they own it (it
// counts against their limits) and become its ADMIN. The list shows the studies
// a user has a role in (with development headers: all studies).
export function studies(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study", requireResearcher(server), async (c) => {
    const researcher = c.get("researcher");
    const rows = await db
      .select()
      .from(studiesTable)
      .where(researcher.devRole ? undefined : isNotNull(studyRole(studiesTable.id, researcher.userId)))
      .orderBy(asc(studiesTable.id));
    return c.json(rows.map(toStudyResponse));
  });

  app.post("/study", requireResearcher(server, { role: "researcher" }), async (c) => {
    const body = await parseJson(c, StudyWriteSchema);

    const researcher = c.get("researcher");
    const ownerId = researcher.userId;
    await checkStudyLimit(db, ownerId);
    const row = await db.transaction(async (tx) => {
      const [study] = await tx
        .insert(studiesTable)
        .values({
          name: body.name,
          archived: body.archived ?? false,
          ownerId,
          ...(body.reopenMinutes !== undefined ? { reopenMinutes: body.reopenMinutes } : {}),
        })
        .returning();
      // Development headers keep the bootstrap rule instead (a study without user roles is open).
      if (!researcher.devRole) await tx.insert(roles).values({ role: "ADMIN", studyId: study!.id, userId: ownerId });
      return study!;
    });
    return c.json(toStudyResponse(row), 201);
  });

  return app;
}

/** Refuses a new study past the owner's limit on studies (docs/accounts.md). */
export async function checkStudyLimit(db: Db, ownerId: number): Promise<void> {
  const { studies: maxStudies } = await effectiveLimits(db, ownerId);
  if (maxStudies != null && (await usage(db, ownerId)).studies >= maxStudies) {
    throw new HttpError(
      403,
      `You can own at most ${maxStudies} studies: delete one, or ask an admin for more`,
      "limit_reached",
    );
  }
}
