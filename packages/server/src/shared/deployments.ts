import { createHash } from "node:crypto";
import {
  loopTitle,
  unitLoops,
  CodebookItemsSchema,
  type CodebookItem,
  type DeploymentChanges,
  type DeploymentResponse,
  type DeploymentVersion,
  type DeploymentWrite,
  type PendingChanges,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { codebookItems, itemsValid, toCodebookResponse, type CodebookRow } from "./codebooks.js";
import { HttpError } from "./http.js";
import { listFinished } from "./finished.js";
import type { DeploymentSpec } from "../runtime/types.js";
import { runtimeSets } from "./sets.js";
import { anyUnitChanges, deployDraftUnits, unitChanges } from "./units.js";

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
 * Deploys: the codebook, with the draft units and sets (`units`, always on
 * the first deploy) or the deployed ones. A new version when the codebook
 * or the units change (docs/plans/design.md §5), recorded with what
 * changed. Freezes the codebook. Warns when a loop gains questions while
 * coders already finished units in it: those units count as unfinished
 * again (docs/architecture.md §8.2).
 */
export async function putDeployment(sql: Sql, jobId: number, body: DeploymentWrite): Promise<DeploymentResponse> {
  const previous = await one<DeploymentRow>(sql, "SELECT * FROM deployments WHERE job_id = $1", [jobId]);
  const warnings = previous ? await reopenWarnings(sql, jobId, previous.codebook_id, body.codebookId) : [];
  const units = !previous || body.units ? await unitChanges(sql, jobId) : null;
  const newUnits = units !== null && (!previous || anyUnitChanges(units));
  const changes: DeploymentChanges = {
    codebook: previous?.codebook_id !== body.codebookId,
    units: newUnits ? units : null,
  };
  const changed = changes.codebook || changes.units !== null;
  const version = !previous ? 1 : previous.version + (changed ? 1 : 0);
  // The units of this version: new versions of changed units, the draft's sets
  if (newUnits) await deployDraftUnits(sql, jobId, version);
  await sql.query(
    `INSERT INTO deployments (job_id, codebook_id, active, version, updated) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (job_id) DO UPDATE SET codebook_id = excluded.codebook_id,
       active = excluded.active, version = excluded.version, updated = excluded.updated`,
    [jobId, body.codebookId, body.active, version],
  );
  if (!previous || changed) {
    await sql.query("INSERT INTO deployment_versions (job_id, version, codebook_id, changes) VALUES ($1, $2, $3, $4)", [
      jobId,
      version,
      body.codebookId,
      JSON.stringify(changes),
    ]);
  }
  await sql.query("UPDATE codebooks SET immutable = true WHERE job_id = $1 AND id = $2", [jobId, body.codebookId]);
  return { ...(await getDeployment(sql, jobId))!, ...(warnings.length > 0 ? { warnings } : {}) };
}

/** What deploying the drafts would change: the units, and the latest codebook if it isn't deployed. */
export async function pendingChanges(sql: Sql, jobId: number): Promise<PendingChanges> {
  const deployed = await one<DeploymentRow>(sql, "SELECT * FROM deployments WHERE job_id = $1", [jobId]);
  const latest = await one<{ id: number }>(sql, "SELECT id FROM codebooks WHERE job_id = $1 ORDER BY id DESC LIMIT 1", [jobId]);
  return {
    units: await unitChanges(sql, jobId),
    codebookId: latest && latest.id !== deployed?.codebook_id ? latest.id : null,
  };
}

/** The deployed versions, newest first. */
export async function deploymentVersions(sql: Sql, jobId: number): Promise<DeploymentVersion[]> {
  const rows = await sql.query<{ version: number; codebook_id: number; changes: DeploymentChanges; created: Date }>(
    "SELECT version, codebook_id, changes, created FROM deployment_versions WHERE job_id = $1 ORDER BY version DESC",
    [jobId],
  );
  return rows.map((r) => ({ version: r.version, codebookId: r.codebook_id, changes: r.changes, created: r.created }));
}

/**
 * Loop title (contracts `loopTitle`, made unique) -> names of its questions
 * (through conditions), from a stored codebook. Titles are for people:
 * progress per loop and warnings.
 */
export async function loopVariables(sql: Sql, jobId: number, codebookId: number): Promise<Map<string, string[]>> {
  const row = await one<{ items: unknown; session: unknown }>(sql, "SELECT items, session FROM codebooks WHERE job_id = $1 AND id = $2", [jobId, codebookId]);
  const loops = new Map<string, string[]>();
  const parsed = row ? CodebookItemsSchema.safeParse(codebookItems(row)) : null;
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
    liveUnits: true,
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
  if (!itemsValid(codebookItems(codebook))) throw new HttpError(409, "The latest design version has issues: fix them to preview it", "codebook_invalid");
  // The drafts: the latest codebook with the draft units and sets.
  const spec = await buildSpec(sql, jobId, codebook, { version: 1, active: true, annotationEpoch: 0, liveUnits: false });
  const digest = createHash("sha256").update(JSON.stringify([spec.codebook, spec.sets])).digest("hex");
  return { ...spec, version: (parseInt(digest.slice(0, 7), 16) % 2 ** 30) + 1 };
}

async function buildSpec(
  sql: Sql,
  jobId: number,
  codebook: CodebookRow,
  meta: Pick<DeploymentSpec, "version" | "active" | "annotationEpoch" | "liveUnits">,
): Promise<DeploymentSpec> {
  const job = await one<{ keep_sessions_open: boolean; redirect_urls: Record<string, string> }>(
    sql,
    "SELECT keep_sessions_open, redirect_urls FROM jobs WHERE id = $1",
    [jobId],
  );
  return {
    jobId,
    ...meta,
    keepSessionsOpen: job?.keep_sessions_open ?? false,
    redirectUrls: job?.redirect_urls ?? {},
    // The runtime works on the items with the session first
    codebook: { ...toCodebookResponse(codebook), items: codebookItems(codebook) },
    sets: await runtimeSets(sql, jobId, meta.liveUnits),
  };
}
