import type { DatabaseSync } from "node:sqlite";
import { CodebookItemsSchema, type ConformanceFixture } from "@annotinder/contracts";
import { putDeployment } from "./deployments.js";

/** Loads a conformance fixture (packages/conformance) as a new, deployed job. Returns its id. */
export function loadFixture(db: DatabaseSync, fixture: ConformanceFixture, jobServerUrl: string | null = null): number {
  const created = new Date().toISOString();
  const lastId = () => (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

  db.prepare("INSERT INTO jobs (name, archived, created) VALUES (?, 0, ?)").run(fixture.job.name, created);
  const jobId = lastId();

  const unitIds = new Map<string, number>();
  for (const unit of fixture.units) {
    db.prepare("INSERT INTO units (jobId, externalId, data) VALUES (?, ?, ?)").run(jobId, unit.externalId, JSON.stringify(unit.data));
    unitIds.set(unit.externalId, lastId());
  }
  for (const unitset of fixture.unitsets) {
    db.prepare("INSERT INTO unitsets (jobId, name, unitIds) VALUES (?, ?, ?)").run(
      jobId,
      unitset.name,
      JSON.stringify(unitset.externalIds.map((e) => unitIds.get(e))),
    );
  }

  const items = CodebookItemsSchema.parse(fixture.codebook.items);
  db.prepare("INSERT INTO codebooks (jobId, note, items, created, immutable) VALUES (?, ?, ?, ?, 0)").run(
    jobId,
    fixture.codebook.note ?? null,
    JSON.stringify(items),
    created,
  );
  putDeployment(db, jobId, { codebookId: lastId(), active: true }, jobServerUrl);

  for (const invite of fixture.invites) {
    db.prepare(
      `INSERT INTO invites (jobId, label, access, secret, emails, maxUses, variables, participantId, participantFromUrl)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      jobId,
      invite.label,
      invite.auth,
      invite.secret,
      invite.emails ? JSON.stringify(invite.emails) : null,
      invite.maxUses ?? null,
      JSON.stringify(invite.variables ?? {}),
      invite.participantId ?? null,
      invite.participantFromUrl ? 1 : 0,
    );
  }
  return jobId;
}
