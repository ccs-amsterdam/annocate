import type { Db } from "../db/index.js";
import { securityLog as securityLogTable } from "../db/schema/index.js";

/** Records a security event of a user (`security_log`): logins, role changes, API keys (docs/security.md). */
export async function securityLog(db: Db, userId: number, event: string, details: Record<string, unknown> = {}): Promise<void> {
  await db.insert(securityLogTable).values({ userId, event, details });
}
