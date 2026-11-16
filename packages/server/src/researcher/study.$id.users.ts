import { Hono } from "hono";
import { StudyUsersWriteSchema, type Role, type StudyUserResponse } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { checkSensitive, requireStudyUser } from "./auth.js";
import { userForEmail } from "../shared/accounts.js";

// A study's users: roles in the study given to users (docs/accounts.md). An
// email address without a user becomes an invitation (a shadow user), which
// its owner's first login claims. Giving or taking the ADMIN role is
// sensitive (researcher/auth.ts). A role the safeguards turned off is
// turned on again only when asked (`restore`).

const THREE_MONTHS_MS = 91 * 24 * 60 * 60_000;

/** A role the safeguards turned off: a registered user's that doesn't apply, or an invitation unclaimed for 3 months. */
const isDisabled = (r: { registered: boolean; applies: boolean; granted_at: Date }) =>
  r.registered ? !r.applies : Date.now() > r.granted_at.getTime() + THREE_MONTHS_MS;

interface RoleRow {
  user_id: number;
  email: string;
  role: Role;
  granted_at: Date;
  registered: boolean;
  applies: boolean;
}

export function studyUsers(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const rolesOf = (studyId: number, sql = db) =>
    sql.query<RoleRow>(
      `SELECT r.user_id, u.email, r.role, r.granted_at, u.registered_at IS NOT NULL AS registered, role_applies(r, u) AS applies
       FROM roles r JOIN users u ON u.id = r.user_id
       WHERE r.study_id = $1 AND r.email_domain IS NULL ORDER BY u.email`,
      [studyId],
    );

  app.get("/study/:studyId/users", requireStudyUser(server, "ADMIN"), async (c) => {
    const rows = await rolesOf(c.get("studyId"));
    return c.json(
      rows.map((r): StudyUserResponse => ({
        email: r.email,
        role: r.role,
        pending: !r.registered,
        disabled: isDisabled(r),
      })),
    );
  });

  app.put("/study/:studyId/users", requireStudyUser(server, "ADMIN"), async (c) => {
    const parsed = StudyUsersWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    // The list replaces the study's users: it must keep someone who can manage them.
    if (!parsed.data.users.some((u) => u.role === "ADMIN"))
      return c.json({ error: "A study needs at least one ADMIN" }, 400);

    const users = parsed.data.users.map((u) => ({ ...u, email: u.email.trim().toLowerCase() }));
    const emails = users.map((u) => u.email);
    const twice = emails.find((e, i) => emails.indexOf(e) !== i);
    if (twice) return c.json({ error: `${twice} is in the list twice` }, 400);

    const studyId = c.get("studyId");
    const researcher = c.get("researcher");
    await db.transaction(async (tx) => {
      const before = await rolesOf(studyId, tx);
      const wanted = new Map<number, Role>();
      const restore = new Set<number>();
      for (const user of users) {
        const { id } = await userForEmail(tx, user.email);
        wanted.set(id, user.role);
        if (user.restore) restore.add(id);
      }
      // Giving or taking the study's ADMIN role is sensitive: not with an API key, and with a recent second factor
      const admins = (ids: number[]) => ids.sort((a, b) => a - b).join(",");
      const adminsBefore = admins(before.filter((r) => r.role === "ADMIN").map((r) => r.user_id));
      const adminsAfter = admins([...wanted].filter(([, role]) => role === "ADMIN").map(([id]) => id));
      if (adminsBefore !== adminsAfter) checkSensitive(server, researcher);

      await tx.query(
        "DELETE FROM roles WHERE study_id = $1 AND user_id IS NOT NULL AND email_domain IS NULL AND NOT (user_id = ANY($2::int[]))",
        [studyId, [...wanted.keys()]],
      );
      // A role given again or changed counts from now (granted_at); an unchanged one keeps its date
      for (const [userId, role] of wanted) {
        await tx.query(
          `INSERT INTO roles (role, study_id, user_id, granted_by) VALUES ($1, $2, $3, $4)
           ON CONFLICT (study_id, user_id) WHERE study_id IS NOT NULL AND user_id IS NOT NULL AND email_domain IS NULL
           DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by,
             granted_at = CASE WHEN roles.role = excluded.role THEN roles.granted_at ELSE now() END`,
          [role, studyId, userId, researcher.email],
        );
      }
      // Restored: a role the safeguards turned off applies again (its date counts from now)
      const restored = before.filter((r) => restore.has(r.user_id) && isDisabled(r)).map((r) => r.user_id);
      if (restored.length > 0) {
        await tx.query(
          "UPDATE roles SET granted_at = now() WHERE study_id = $1 AND user_id = ANY($2::int[]) AND email_domain IS NULL",
          [studyId, restored],
        );
      }
    });
    return c.body(null, 204);
  });

  return app;
}
