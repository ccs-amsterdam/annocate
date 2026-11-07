import { Hono } from "hono";
import { StudyUsersWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";

export function studyUsers(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/users", requireStudyUser(server, "ADMIN"), async (c) =>
    c.json(await db.query("SELECT email, role FROM study_users WHERE study_id = $1", [c.get("studyId")])),
  );

  app.put("/study/:studyId/users", requireStudyUser(server, "ADMIN"), async (c) => {
    const parsed = StudyUsersWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    // The list replaces the study's users: it must keep someone who can manage them.
    if (!parsed.data.users.some((u) => u.role === "ADMIN")) return c.json({ error: "A study needs at least one ADMIN" }, 400);

    // Accounts are keyed on the lowercased email (shared/accounts.ts).
    const users = parsed.data.users.map((u) => ({ ...u, email: u.email.trim().toLowerCase() }));
    const emails = users.map((u) => u.email);
    const twice = emails.find((e, i) => emails.indexOf(e) !== i);
    if (twice) return c.json({ error: `${twice} is in the list twice` }, 400);

    const studyId = c.get("studyId");
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM study_users WHERE study_id = $1", [studyId]);
      for (const user of users) {
        await tx.query("INSERT INTO study_users (study_id, email, role) VALUES ($1, $2, $3)", [studyId, user.email, user.role]);
      }
    });
    return c.body(null, 204);
  });

  return app;
}
