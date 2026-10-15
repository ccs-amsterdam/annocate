import type { OutboxEntry, OutboxStore, OutboxWrite } from "./outbox.js";

/** The part of a Durable Object's SQL storage (`ctx.storage.sql`) used here. */
export interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

/**
 * The outbox on Cloudflare: the Durable Object's own SQLite storage. Writes
 * made while handling a request are durable before the response leaves (the
 * runtime holds the response until storage confirms), so a coder's "saved"
 * is never ahead of the disk.
 */
export class DurableObjectOutboxStore implements OutboxStore {
  constructor(private sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deploymentId TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      write TEXT NOT NULL
    )`);
  }

  append(deploymentId: string, write: OutboxWrite, createdAt: number): void {
    this.sql.exec("INSERT INTO outbox (deploymentId, createdAt, write) VALUES (?, ?, ?)", deploymentId, createdAt, JSON.stringify(write));
  }

  pending(deploymentId: string, limit: number): OutboxEntry[] {
    return this.sql
      .exec("SELECT id, createdAt, write FROM outbox WHERE deploymentId = ? ORDER BY id LIMIT ?", deploymentId, limit)
      .toArray()
      .map((r) => ({ id: Number(r.id), createdAt: Number(r.createdAt), write: JSON.parse(String(r.write)) as OutboxWrite }));
  }

  remove(ids: number[]): void {
    if (ids.length > 0) this.sql.exec(`DELETE FROM outbox WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  }

  stats(deploymentId: string) {
    const [row] = this.sql
      .exec("SELECT COUNT(*) AS pending, MIN(createdAt) AS oldestAt FROM outbox WHERE deploymentId = ?", deploymentId)
      .toArray();
    return { pending: Number(row.pending), oldestAt: row.oldestAt === null ? null : Number(row.oldestAt) };
  }

  deployments(): string[] {
    return this.sql
      .exec("SELECT DISTINCT deploymentId FROM outbox")
      .toArray()
      .map((r) => String(r.deploymentId));
  }
}
