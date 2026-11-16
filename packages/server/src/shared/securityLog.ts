import type { Sql } from "../db.js";

/** Records a security event of a user (`security_log`): logins, role changes, API keys (docs/security.md). */
export async function securityLog(sql: Sql, userId: number, event: string, details: object = {}): Promise<void> {
  await sql.query("INSERT INTO security_log (user_id, event, details) VALUES ($1, $2, $3)", [userId, event, JSON.stringify(details)]);
}
