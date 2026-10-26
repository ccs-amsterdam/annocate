import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  ALL_UNITS_UNITSET,
  CodebookItemsSchema,
  type CodebookItem,
  type DeploymentResponse,
  type DeploymentWrite,
} from "@annotinder/contracts";
import { listFinished } from "./finished.js";
import type { DeploymentSpec } from "../runtime/types.js";

interface DeploymentRow {
  jobId: number;
  codebookId: number;
  active: number;
  version: number;
  updated: string;
}

export interface CodebookRow {
  id: number;
  jobId: number;
  note: string | null;
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
    active: !!row.active,
    version: row.version,
    updated: new Date(row.updated),
  };
}

/**
 * Creates or replaces a job's deployment, bumping its version and freezing
 * the codebook. Warns when a loop gains questions
 * while coders already finished units in it: those units count as
 * unfinished again (docs/architecture.md §8.2).
 */
export function putDeployment(
  db: DatabaseSync,
  jobId: number,
  body: DeploymentWrite,
): DeploymentResponse {
  const previous = getDeployment(db, jobId);
  const warnings = previous ? reopenWarnings(db, jobId, previous.codebookId, body.codebookId) : [];
  const version = (previous?.version ?? 0) + 1;
  db.prepare(
    `INSERT INTO deployments (jobId, codebookId, active, version, updated) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (jobId) DO UPDATE SET codebookId = excluded.codebookId, active = excluded.active,
       version = excluded.version, updated = excluded.updated`,
  ).run(jobId, body.codebookId, body.active ? 1 : 0, version, new Date().toISOString());
  db.prepare("UPDATE codebooks SET immutable = 1 WHERE jobId = ? AND id = ?").run(jobId, body.codebookId);
  return { ...getDeployment(db, jobId)!, ...(warnings.length > 0 ? { warnings } : {}) };
}

/** Loop name -> names of its questions (through conditions), from a stored codebook. */
export function loopVariables(db: DatabaseSync, jobId: number, codebookId: number): Map<string, string[]> {
  const row = db.prepare("SELECT items FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, codebookId) as
    | { items: string }
    | undefined;
  const loops = new Map<string, string[]>();
  const parsed = row ? CodebookItemsSchema.safeParse(JSON.parse(row.items)) : null;
  if (!parsed?.success) return loops;
  const questions = (items: CodebookItem[]): string[] =>
    items.flatMap((i) => (i.type === "condition" ? questions(i.children as CodebookItem[]) : [i.name]));
  const walk = (items: CodebookItem[]) => {
    for (const item of items) {
      if (item.type === "unit_loop") loops.set(item.name, questions(item.children as CodebookItem[]));
      else if (item.type === "condition") walk(item.children as CodebookItem[]);
    }
  };
  walk(parsed.data);
  return loops;
}

function reopenWarnings(db: DatabaseSync, jobId: number, previousCodebookId: number, codebookId: number): string[] {
  if (previousCodebookId === codebookId) return [];
  const before = loopVariables(db, jobId, previousCodebookId);
  const after = loopVariables(db, jobId, codebookId);
  const warnings: string[] = [];
  for (const [loop, variables] of after) {
    // The same loop in the previous version: same name, or else the one sharing most questions.
    const previous =
      before.get(loop) ??
      [...before.values()].sort(
        (a, b) => b.filter((v) => variables.includes(v)).length - a.filter((v) => variables.includes(v)).length,
      )[0];
    if (!previous || !previous.some((v) => variables.includes(v))) continue;
    const added = variables.filter((v) => !previous.includes(v));
    if (added.length === 0) continue;
    const finished = listFinished(db, jobId, { loops: [{ level: "unit", loop, variables: previous }] }).length;
    if (finished > 0) {
      warnings.push(
        `Loop '${loop}' gained questions (${added.join(", ")}): ${finished} finished unit codings ` +
          `will be unfinished again, and coders get these units back to answer the new questions.`,
      );
    }
  }
  return warnings;
}

/** Everything the runtime needs to run a deployed job. */
export function getDeploymentSpec(db: DatabaseSync, jobId: number): DeploymentSpec | null {
  const deployment = getDeployment(db, jobId);
  if (!deployment) return null;
  const codebook = db
    .prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?")
    .get(jobId, deployment.codebookId) as CodebookRow | undefined;
  if (!codebook) return null;
  const { annotationEpoch } = db.prepare("SELECT annotationEpoch FROM deployments WHERE jobId = ?").get(jobId) as {
    annotationEpoch: number;
  };
  return buildSpec(db, jobId, codebook, { version: deployment.version, active: deployment.active, annotationEpoch });
}

/**
 * The spec for previewing: the job's latest codebook, deployed or not,
 * always active. Its `version` is derived from the content, so the preview
 * picks up every edit.
 */
export function getPreviewSpec(db: DatabaseSync, jobId: number): DeploymentSpec | null {
  const codebook = db.prepare("SELECT * FROM codebooks WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as
    | CodebookRow
    | undefined;
  if (!codebook) return null;
  const spec = buildSpec(db, jobId, codebook, { version: 1, active: true, annotationEpoch: 0 });
  const digest = createHash("sha256").update(JSON.stringify([spec.codebook, spec.unitsets])).digest("hex");
  return { ...spec, version: (parseInt(digest.slice(0, 7), 16) % 2 ** 30) + 1 };
}

function buildSpec(
  db: DatabaseSync,
  jobId: number,
  codebook: CodebookRow,
  meta: Pick<DeploymentSpec, "version" | "active" | "annotationEpoch">,
): DeploymentSpec {
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
    ...meta,
    codebook: {
      id: codebook.id,
      jobId: codebook.jobId,
      note: codebook.note,
      items: JSON.parse(codebook.items),
      created: new Date(codebook.created),
      immutable: !!codebook.immutable,
    },
    unitsets: [{ name: ALL_UNITS_UNITSET, unitIds: allUnitIds }, ...unitsets],
  };
}
