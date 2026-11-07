import { Hono } from "hono";
import { StudyWriteSchema } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { toStudyResponse, type StudyRow } from "../shared/studies.js";
import { effectiveLimits, ensureUser, usage } from "../shared/accounts.js";
import { HttpError } from "../shared/http.js";

// A server hosts any number of studies. A researcher (account role, see
// docs/accounts.md) may create one within their limits: they own it (it
// counts against their limits) and become its ADMIN. The list shows the studies
// a user has a role in (with development headers: all studies).
export function studies(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study", requireResearcher(server), async (c) => {
    const researcher = c.get("researcher");
    const rows = researcher.devRole
      ? await db.query<StudyRow>("SELECT * FROM studies ORDER BY id")
      : await db.query<StudyRow>(
          "SELECT j.* FROM studies j JOIN study_users u ON u.study_id = j.id WHERE u.email = $1 ORDER BY j.id",
          [researcher.email],
        );
    return c.json(rows.map(toStudyResponse));
  });

  app.post("/study", requireResearcher(server, { role: "researcher" }), async (c) => {
    const parsed = StudyWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const researcher = c.get("researcher");
    const ownerId = researcher.userId ?? (await ensureUser(db, researcher.email)).id;
    await checkStudyLimit(db, ownerId);
    const row = await db.transaction(async (tx) => {
      const study = await one<StudyRow>(tx, "INSERT INTO studies (name, archived, owner_id, keep_sessions_open) VALUES ($1, $2, $3, $4) RETURNING *", [
        parsed.data.name,
        parsed.data.archived ?? false,
        ownerId,
        parsed.data.keepSessionsOpen ?? false,
      ]);
      // Development headers keep the bootstrap rule instead (a study without study users is open).
      if (!researcher.devRole) {
        await tx.query("INSERT INTO study_users (study_id, email, role) VALUES ($1, $2, 'ADMIN')", [study!.id, researcher.email]);
      }
      return study!;
    });
    return c.json(toStudyResponse(row), 201);
  });

  return app;
}

/** Refuses a new study past the owner's limit on studies (docs/accounts.md). */
export async function checkStudyLimit(db: Sql, ownerId: number): Promise<void> {
  const { studies: maxStudies } = await effectiveLimits(db, ownerId);
  if (maxStudies != null && (await usage(db, ownerId)).studies >= maxStudies) {
    throw new HttpError(403, `You can own at most ${maxStudies} studies: delete one, or ask an admin for more`, "limit_reached");
  }
}
