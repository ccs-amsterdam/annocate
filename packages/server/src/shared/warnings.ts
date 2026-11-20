import type { ServerWarning } from "@annotinder/contracts";
import { and, eq, exists, gt, isNotNull, not, notExists, sql } from "drizzle-orm";
import { identities, roles, users } from "../db/schema/index.js";
import { accountRole } from "../db/sql.js";
import type { Server } from "../context.js";

// Server hardening warnings for admins (the lab's Authentication standard,
// "Server hardening warnings"; docs/security.md).

/** Admin logins in this many days without the second factor signal make the `no_2fa_signal` warning. */
const RECENT_DAYS = 30;

export async function serverWarnings(server: Server): Promise<ServerWarning[]> {
  const warnings: ServerWarning[] = [];
  const issuer = server.login?.oidc.issuer;
  if (server.insecure.disable2fa) {
    warnings.push({
      code: "2fa_not_required",
      message:
        "2FA not required (AUTH_INSECURE_DISABLE_2FA): sensitive actions only need a recent login, not a second factor. Not for sensitive research data.",
    });
  }
  if (server.insecure.disableEmailVerification) {
    warnings.push({
      code: "email_verification_not_required",
      message:
        "Email verification not required (AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION): users whose login provider didn't confirm their email address can log in and claim invitations to it. Not for sensitive research data.",
    });
  }
  // Users with roles of their own whose provider didn't confirm their address: check that they are the right people
  const unverified = await server.db.$count(
    users,
    and(
      eq(users.emailVerified, false),
      exists(
        server.db
          .select({ one: sql`1` })
          .from(roles)
          .where(eq(roles.userId, users.id)),
      ),
    ),
  );
  if (unverified > 0) {
    warnings.push({
      code: "unverified_roles",
      message: `${unverified} user${unverified === 1 ? " has" : "s have"} roles but an email address their login provider didn't confirm ("email not verified" below). Check that these are the right people.`,
    });
  }
  // Server admins whose latest login lacked the second factor: their admin access is off, so the provider's 2FA or OIDC_MFA_CLAIM may be wrong
  if (!server.insecure.disable2fa) {
    const lacking = await server.db.$count(
      users,
      and(
        not(users.hasMfa),
        gt(users.lastLoginAt, sql`now() - make_interval(days => ${RECENT_DAYS})`),
        eq(accountRole(users.id), "admin"),
      ),
    );
    if (lacking > 0) {
      warnings.push({
        code: "no_2fa_signal",
        message: `${lacking} server admin${lacking === 1 ? "" : "s"} logged in recently without the second factor signal (OIDC_MFA_CLAIM), so their admin access is off. If they did use a second factor, check the provider's 2FA settings and OIDC_MFA_CLAIM.`,
      });
    }
  }
  // Moving to another login provider: who hasn't linked their login there yet, and the end date
  const previous = server.login?.previous;
  if (previous && issuer) {
    const until = previous.until.toISOString().slice(0, 10);
    if (Date.now() >= previous.until.getTime()) {
      warnings.push({
        code: "migration_not_finished",
        message: `The previous login provider (OIDC_PREVIOUS_HOST) is still configured after its end date (OIDC_PREVIOUS_UNTIL, ${until}): it is no longer accepted, so remove the OIDC_PREVIOUS_* settings.`,
      });
    } else {
      const linkedThere = server.db
        .select({ one: sql`1` })
        .from(identities)
        .where(and(eq(identities.userId, users.id), sql`rtrim(${identities.iss}, '/') = rtrim(${issuer}::text, '/')`));
      const unlinked = await server.db.$count(users, and(isNotNull(users.registeredAt), notExists(linkedThere)));
      warnings.push({
        code: "migration_not_finished",
        message: `Moving to another login provider until ${until} (OIDC_PREVIOUS_UNTIL): ${unlinked} user${unlinked === 1 ? " hasn't" : "s haven't"} linked their login there yet ("not linked" below). Remind them before then.`,
      });
    }
  }
  return warnings;
}
