import { Hono } from "hono";
import { StudyUsersWriteSchema, type Role, type StudyUserResponse } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { checkSensitive, requireStudyUser } from "./auth.js";
import { and, asc, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { roles, users } from "../db/schema/index.js";
import { roleApplies } from "../db/sql.js";
import { userForEmail } from "../shared/accounts.js";

// A study's users: roles in the study given to users (docs/accounts.md). An
// email address without a user becomes an invitation (a shadow user), which
// its owner's first login claims. Giving or taking the ADMIN role is
// sensitive (researcher/auth.ts). A role the safeguards turned off is
// turned on again only when asked (`restore`).

const THREE_MONTHS_MS = 91 * 24 * 60 * 60_000;

/** A role the safeguards turned off: a registered user's that doesn't apply, or an invitation unclaimed for 3 months. */
const isDisabled = (r: { registered: boolean; applies: boolean; grantedAt: Date }) =>
  r.registered ? !r.applies : Date.now() > r.grantedAt.getTime() + THREE_MONTHS_MS;

/** A study's roles given to users (not to email domains). */
const userRolesOf = (studyId: number) => and(eq(roles.studyId, studyId), isNotNull(roles.userId), isNull(roles.emailDomain));

/** The users with a role in the study, and whether it applies (the safeguards). */
const rolesOf = (db: Db, studyId: number) =>
  db
    .select({
      userId: users.id,
      email: users.email,
      role: sql<Role>`${roles.role}`,
      grantedAt: roles.grantedAt,
      registered: sql<boolean>`${users.registeredAt} IS NOT NULL`,
      applies: roleApplies(roles, users),
    })
    .from(roles)
    .innerJoin(users, eq(users.id, roles.userId))
    .where(userRolesOf(studyId))
    .orderBy(asc(users.email));

export function studyUsers(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/users", requireStudyUser(server, "ADMIN"), async (c) => {
    const rows = await rolesOf(db, c.get("studyId"));
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
      const before = await rolesOf(tx, studyId);
      const wanted = new Map<number, Role>();
      const restore = new Set<number>();
      for (const user of users) {
        const { id } = await userForEmail(tx, user.email);
        wanted.set(id, user.role);
        if (user.restore) restore.add(id);
      }
      // Giving or taking the study's ADMIN role is sensitive: not with an API key, and with a recent second factor
      const admins = (ids: number[]) => ids.sort((a, b) => a - b).join(",");
      const adminsBefore = admins(before.filter((r) => r.role === "ADMIN").map((r) => r.userId));
      const adminsAfter = admins([...wanted].filter(([, role]) => role === "ADMIN").map(([id]) => id));
      if (adminsBefore !== adminsAfter) checkSensitive(server, researcher);

      await tx.delete(roles).where(and(userRolesOf(studyId), notInArray(roles.userId, [...wanted.keys()])));
      // A role given again or changed counts from now (granted_at); an unchanged one keeps its date
      for (const [userId, role] of wanted) {
        await tx
          .insert(roles)
          .values({ role, studyId, userId, grantedBy: researcher.email })
          .onConflictDoUpdate({
            // A user's role on the study (the partial unique index roles_user_study)
            target: [roles.studyId, roles.userId],
            targetWhere: and(isNotNull(roles.studyId), isNotNull(roles.userId), isNull(roles.emailDomain)),
            set: {
              role: sql`excluded.role`,
              grantedBy: sql`excluded.granted_by`,
              grantedAt: sql`CASE WHEN ${roles.role} = excluded.role THEN ${roles.grantedAt} ELSE now() END`,
            },
          });
      }
      // Restored: a role the safeguards turned off applies again (its date counts from now)
      const restored = before.filter((r) => restore.has(r.userId) && isDisabled(r)).map((r) => r.userId);
      if (restored.length > 0) {
        await tx
          .update(roles)
          .set({ grantedAt: sql`now()` })
          .where(and(userRolesOf(studyId), inArray(roles.userId, restored)));
      }
    });
    return c.body(null, 204);
  });

  return app;
}
