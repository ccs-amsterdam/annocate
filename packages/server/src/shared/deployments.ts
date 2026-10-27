import { createHash } from "node:crypto";
import {
  loopTitle,
  unitLoops,
  ALL_UNITS_UNITSET,
  CodebookItemsSchema,
  type CodebookItem,
  type DeploymentResponse,
  type DeploymentWrite,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { codebookItems, itemsValid, toCodebookResponse, type CodebookRow } from "./codebooks.js";
import { HttpError } from "./http.js";
import { listFinished } from "./finished.js";
import type { DeploymentSpec } from "../runtime/types.js";

interface DeploymentRow {
  job_id: number;
  codebook_id: number;
  active: boolean;
  version: number;
  annotation_epoch: number;
  updated: Date;
}

export async function getDeployment(sql: Sql, jobId: number): Promise<DeploymentResponse | null> {
  const row = await one<DeploymentRow>(sql, "SELECT * FROM deployments WHERE job_id = $1", [jobId]);
  if (!row) return null;
  return { jobId: row.job_id, codebookId: row.codebook_id, active: row.active, version: row.version, updated: row.updated };
}

/**
 * Creates or replaces a job's deployment, bumping its version and freezing
 * the codebook. Warns when a loop gains questions while coders already
 * finished units in it: those units count as unfinished again
 * (docs/architecture.md §8.2).
 */
export async function putDeployment(sql: Sql, jobId: number, body: DeploymentWrite): Promise<DeploymentResponse> {
  const previous = await getDeployment(sql, jobId);
  const warnings = previous ? await reopenWarnings(sql, jobId, previous.codebookId, body.codebookId) : [];
  await sql.query(
    `INSERT INTO deployments (job_id, codebook_id, active, version, updated) VALUES ($1, $2, $3, 1, now())
     ON CONFLICT (job_id) DO UPDATE SET codebook_id = excluded.codebook_id, active = excluded.active,
       version = deployments.version + 1, updated = excluded.updated`,
    [jobId, body.codebookId, body.active],
  );
  await sql.query("UPDATE codebooks SET immutable = true WHERE job_id = $1 AND id = $2", [jobId, body.codebookId]);
  return { ...(await getDeployment(sql, jobId))!, ...(warnings.length > 0 ? { warnings } : {}) };
}

/**
 * Loop title (contracts `loopTitle`, made unique) -> names of its questions
 * (through conditions), from a stored codebook. Titles are for people:
 * progress per loop and warnings.
 */
export async function loopVariables(sql: Sql, jobId: number, codebookId: number): Promise<Map<string, string[]>> {
  const row = await one<{ items: unknown }>(sql, "SELECT items FROM codebooks WHERE job_id = $1 AND id = $2", [jobId, codebookId]);
  const loops = new Map<string, string[]>();
  const parsed = row ? CodebookItemsSchema.safeParse(row.items) : null;
  if (!parsed?.success) return loops;
  const questions = (items: CodebookItem[]): string[] =>
    items.flatMap((i) => (i.type === "condition" ? questions(i.children as CodebookItem[]) : "variable" in i ? [i.name] : []));
  for (const { key, loop } of unitLoops(parsed.data)) {
    const title = loopTitle(loop, key);
    loops.set(loops.has(title) ? `${title} (${key})` : title, questions(loop.children as CodebookItem[]));
  }
  return loops;
}

async function reopenWarnings(sql: Sql, jobId: number, previousCodebookId: number, codebookId: number): Promise<string[]> {
  if (previousCodebookId === codebookId) return [];
  const before = await loopVariables(sql, jobId, previousCodebookId);
  const after = await loopVariables(sql, jobId, codebookId);
  const warnings: string[] = [];
  for (const [loop, variables] of after) {
    // The same loop in the previous version: same title, or else the one sharing most questions.
    const previous =
      before.get(loop) ??
      [...before.values()].sort(
        (a, b) => b.filter((v) => variables.includes(v)).length - a.filter((v) => variables.includes(v)).length,
      )[0];
    if (!previous || !previous.some((v) => variables.includes(v))) continue;
    const added = variables.filter((v) => !previous.includes(v));
    if (added.length === 0) continue;
    const finished = (await listFinished(sql, jobId, { loops: [{ level: "unit", loop, variables: previous }] })).length;
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
export async function getDeploymentSpec(sql: Sql, jobId: number): Promise<DeploymentSpec | null> {
  const deployment = await one<DeploymentRow>(sql, "SELECT * FROM deployments WHERE job_id = $1", [jobId]);
  if (!deployment) return null;
  const codebook = await one<CodebookRow>(sql, "SELECT * FROM codebooks WHERE job_id = $1 AND id = $2", [jobId, deployment.codebook_id]);
  if (!codebook) return null;
  return buildSpec(sql, jobId, codebook, {
    version: deployment.version,
    active: deployment.active,
    annotationEpoch: deployment.annotation_epoch,
  });
}

/**
 * The spec for previewing: the job's latest codebook, deployed or not,
 * always active. Its `version` is derived from the content, so the preview
 * picks up every edit.
 */
export async function getPreviewSpec(sql: Sql, jobId: number): Promise<DeploymentSpec | null> {
  const codebook = await one<CodebookRow>(sql, "SELECT * FROM codebooks WHERE job_id = $1 ORDER BY id DESC LIMIT 1", [jobId]);
  if (!codebook) return null;
  if (!itemsValid(codebookItems(codebook))) throw new HttpError(409, "The latest codebook has issues: fix them to preview it", "codebook_invalid");
  const spec = await buildSpec(sql, jobId, codebook, { version: 1, active: true, annotationEpoch: 0 });
  const digest = createHash("sha256").update(JSON.stringify([spec.codebook, spec.unitsets])).digest("hex");
  return { ...spec, version: (parseInt(digest.slice(0, 7), 16) % 2 ** 30) + 1 };
}

async function buildSpec(
  sql: Sql,
  jobId: number,
  codebook: CodebookRow,
  meta: Pick<DeploymentSpec, "version" | "active" | "annotationEpoch">,
): Promise<DeploymentSpec> {
  const unitsets = await sql.query<{ name: string; unitIds: number[] }>(
    `SELECT name, unit_ids AS "unitIds" FROM unitsets WHERE job_id = $1 ORDER BY id`,
    [jobId],
  );
  const allUnitIds = (await sql.query<{ id: number }>("SELECT id FROM units WHERE job_id = $1 ORDER BY id", [jobId])).map((r) => r.id);
  return {
    jobId,
    ...meta,
    codebook: toCodebookResponse(codebook),
    unitsets: [{ name: ALL_UNITS_UNITSET, unitIds: allUnitIds }, ...unitsets],
  };
}
