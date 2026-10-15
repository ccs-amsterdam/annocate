import { DatabaseSync } from "node:sqlite";
import type { OutboxEntry, OutboxStore, OutboxWrite } from "./outbox.js";

/**
 * The outbox on Node: a small SQLite file. Each append is committed before
 * the coder is told their answers were saved, so a crash loses nothing that
 * was acknowledged.
 */
export class SqliteOutboxStore implements OutboxStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deploymentId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        write TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS outbox_deployment ON outbox (deploymentId, id);
    `);
  }

  append(deploymentId: string, write: OutboxWrite, createdAt: number): void {
    this.db.prepare("INSERT INTO outbox (deploymentId, createdAt, write) VALUES (?, ?, ?)").run(deploymentId, createdAt, JSON.stringify(write));
  }

  pending(deploymentId: string, limit: number): OutboxEntry[] {
    const rows = this.db
      .prepare("SELECT id, createdAt, write FROM outbox WHERE deploymentId = ? ORDER BY id LIMIT ?")
      .all(deploymentId, limit) as { id: number; createdAt: number; write: string }[];
    return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, write: JSON.parse(r.write) as OutboxWrite }));
  }

  remove(ids: number[]): void {
    if (ids.length === 0) return;
    this.db.prepare(`DELETE FROM outbox WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  }

  stats(deploymentId: string) {
    const row = this.db
      .prepare("SELECT COUNT(*) AS pending, MIN(createdAt) AS oldestAt FROM outbox WHERE deploymentId = ?")
      .get(deploymentId) as { pending: number; oldestAt: number | null };
    return { pending: row.pending, oldestAt: row.oldestAt };
  }

  deployments(): string[] {
    return (this.db.prepare("SELECT DISTINCT deploymentId FROM outbox").all() as { deploymentId: string }[]).map(
      (r) => r.deploymentId,
    );
  }
}
