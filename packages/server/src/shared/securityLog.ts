import type { Db } from "../db/index.js";
import { securityLog as securityLogTable } from "../db/schema/index.js";

/**
 * Records a security event of a user (`security_log`, docs/security.md):
 * their logins and linked identities, API keys made and revoked, and what
 * they did that can't be undone or changes who has access: studies exported
 * and deleted, answers reset, a study's users changed.
 */
export async function securityLog(
  db: Db,
  userId: number,
  event: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(securityLogTable).values({ userId, event, details });
}
