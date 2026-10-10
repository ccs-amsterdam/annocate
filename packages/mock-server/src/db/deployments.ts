import type { DatabaseSync } from "node:sqlite";
import {
  ALL_UNITS_UNITSET,
  type DeploymentResponse,
  type DeploymentSpec,
  type DeploymentWrite,
} from "@annotinder/contracts";

interface DeploymentRow {
  jobId: number;
  codebookId: number;
  distribution: string;
  active: number;
  version: number;
  updated: string;
}

interface CodebookRow {
  id: number;
  jobId: number;
  name: string;
  items: string;
  created: string;
  immutable: number;
}

export function getDeployment(db: DatabaseSync, jobId: number): DeploymentResponse | null {
  const row = db.prepare("SELECT * FROM deployments WHERE jobId = ?").get(jobId) as DeploymentRow | undefined;
  if (!row) return null;
  return {
    jobId: row.jobId,
    codebookId: row.codebookId,
    distribution: JSON.parse(row.distribution),
    active: !!row.active,
    version: row.version,
    updated: new Date(row.updated),
  };
}

/** Creates or replaces a job's deployment, bumping its version and freezing the codebook. */
export function putDeployment(db: DatabaseSync, jobId: number, body: DeploymentWrite): DeploymentResponse {
  const previous = getDeployment(db, jobId);
  const version = (previous?.version ?? 0) + 1;
  db.prepare(
    `INSERT INTO deployments (jobId, codebookId, distribution, active, version, updated) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (jobId) DO UPDATE SET codebookId = excluded.codebookId, distribution = excluded.distribution,
       active = excluded.active, version = excluded.version, updated = excluded.updated`,
  ).run(jobId, body.codebookId, JSON.stringify(body.distribution), body.active ? 1 : 0, version, new Date().toISOString());
  db.prepare("UPDATE codebooks SET immutable = 1 WHERE jobId = ? AND id = ?").run(jobId, body.codebookId);
  return getDeployment(db, jobId)!;
}

/** Everything the job server needs to run a deployed job (backend API `GET /deployment`). */
export function getDeploymentSpec(db: DatabaseSync, jobId: number): DeploymentSpec | null {
  const deployment = getDeployment(db, jobId);
  if (!deployment) return null;

  const codebook = db
    .prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?")
    .get(jobId, deployment.codebookId) as CodebookRow | undefined;
  if (!codebook) return null;

  const unitsets = (
    db.prepare("SELECT name, unitIds FROM unitsets WHERE jobId = ? ORDER BY id").all(jobId) as unknown as {
      name: string;
      unitIds: string;
    }[]
  ).map((row) => ({ name: row.name, unitIds: JSON.parse(row.unitIds) as number[] }));
  const allUnitIds = (
    db.prepare("SELECT id FROM units WHERE jobId = ? ORDER BY id").all(jobId) as unknown as { id: number }[]
  ).map((r) => r.id);

  return {
    jobId,
    version: deployment.version,
    active: deployment.active,
    codebook: {
      id: codebook.id,
      jobId: codebook.jobId,
      name: codebook.name,
      items: JSON.parse(codebook.items),
      created: new Date(codebook.created),
      immutable: !!codebook.immutable,
    },
    unitsets: [{ name: ALL_UNITS_UNITSET, unitIds: allUnitIds }, ...unitsets],
    distribution: deployment.distribution,
  };
}
