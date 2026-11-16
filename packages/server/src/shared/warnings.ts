import type { ServerWarning } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server } from "../context.js";

// Server hardening warnings for admins (the lab's Authentication standard,
// "Server hardening warnings"; docs/security.md).

/**
 * Issuers of the lab's shared OIDC provider (its `idp` realm): servers that
 * log in with it must not hold sensitive data, and admins are told so (the
 * standard's "Choosing an OIDC provider"). The provider's public hostname
 * isn't fixed yet: its issuer goes here once it is.
 */
export const SHARED_OIDC_ISSUERS: readonly string[] = [];

const sameIssuer = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** Researcher logins in this many days without the second factor signal make the `no_2fa_signal` warning. */
const RECENT_DAYS = 30;

export async function serverWarnings(server: Server): Promise<ServerWarning[]> {
  const warnings: ServerWarning[] = [];
  const issuer = server.login?.oidc.issuer;
  if (issuer && SHARED_OIDC_ISSUERS.some((shared) => sameIssuer(shared, issuer))) {
    warnings.push({
      code: "shared_provider",
      message:
        "Shared OIDC provider: not for sensitive data. Logins come from the lab's shared provider, so this server must not hold sensitive research data.",
    });
  }
  // Researchers and admins whose latest login lacked the second factor: they can't work, so the provider's 2FA or OIDC_MFA_CLAIM is likely wrong
  const lacking = await one<{ n: number }>(
    server.db,
    `SELECT count(*)::int AS n FROM users u
     WHERE NOT u.has_mfa AND u.last_login_at > now() - make_interval(days => $1) AND account_role(u.id) IN ('researcher', 'admin')`,
    [RECENT_DAYS],
  );
  if (lacking && lacking.n > 0) {
    warnings.push({
      code: "no_2fa_signal",
      message: `${lacking.n} researcher${lacking.n === 1 ? "" : "s"} logged in recently without the second factor signal (OIDC_MFA_CLAIM), so they can't work. Check the provider's 2FA settings and OIDC_MFA_CLAIM.`,
    });
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
      const unlinked = await one<{ n: number }>(
        server.db,
        `SELECT count(*)::int AS n FROM users u WHERE u.registered_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM identities i WHERE i.user_id = u.id AND rtrim(i.iss, '/') = rtrim($1::text, '/'))`,
        [issuer],
      );
      warnings.push({
        code: "migration_not_finished",
        message: `Moving to another login provider until ${until} (OIDC_PREVIOUS_UNTIL): ${unlinked?.n ?? 0} user${unlinked?.n === 1 ? " hasn't" : "s haven't"} linked their login there yet ("not linked" below). Remind them before then.`,
      });
    }
  }
  return warnings;
}
