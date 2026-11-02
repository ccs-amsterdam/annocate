import { createHash } from "node:crypto";
import { CLIENT_VERSION } from "../version.js";
import {
  loopTitle,
  unitLoops,
  DesignItemsSchema,
  type DesignItem,
  type DeploymentChanges,
  type DeploymentResponse,
  type DeploymentVersion,
  type DeploymentWrite,
  type PendingChanges,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { designVersionItems, itemsValid, toDesignVersion, type DesignVersionRow } from "./designVersions.js";
import { HttpError } from "./http.js";
import { listFinished } from "./finished.js";
import type { DeploymentSpec } from "../runtime/types.js";
import { runtimeSets } from "./sets.js";
import { anyUnitChanges, deployDraftUnits, unitChanges } from "./units.js";

interface DeploymentRow {
  job_id: number;
  design_version_id: number;
  active: boolean;
  version: number;
  annotation_epoch: number;
  updated: Date;
}

export async function getDeployment(sql: Sql, jobId: number): Promise<DeploymentResponse | null> {
  const row = await one<DeploymentRow>(sql, "SELECT * FROM deployments WHERE job_id = $1", [jobId]);
  if (!row) return null;
  return { jobId: row.job_id, designVersionId: row.design_version_id, active: row.active, version: row.version, updated: row.updated };
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
  const warnings = previous ? await reopenWarnings(sql, jobId, previous.design_version_id, body.designVersionId) : [];
  const units = !previous || body.units ? await unitChanges(sql, jobId) : null;
  const newUnits = units !== null && (!previous || anyUnitChanges(units));
  const changes: DeploymentChanges = {
    design: previous?.design_version_id !== body.designVersionId,
    units: newUnits ? units : null,
  };
  const changed = changes.design || changes.units !== null;
  const version = !previous ? 1 : previous.version + (changed ? 1 : 0);
  // The units of this version: new versions of changed units, the draft's sets
  if (newUnits) await deployDraftUnits(sql, jobId, version);
  await sql.query(
    `INSERT INTO deployments (job_id, design_version_id, active, version, updated) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (job_id) DO UPDATE SET design_version_id = excluded.design_version_id,
       active = excluded.active, version = excluded.version, updated = excluded.updated`,
    [jobId, body.designVersionId, body.active, version],
  );
  if (!previous || changed) {
    await sql.query(
      "INSERT INTO deployment_versions (job_id, version, design_version_id, changes, client_release, client_commit) VALUES ($1, $2, $3, $4, $5, $6)",
      [jobId, version, body.designVersionId, JSON.stringify(changes), CLIENT_VERSION.release, CLIENT_VERSION.commit],
    );
  }
  await sql.query("UPDATE design_versions SET immutable = true WHERE job_id = $1 AND id = $2", [jobId, body.designVersionId]);
  return { ...(await getDeployment(sql, jobId))!, ...(warnings.length > 0 ? { warnings } : {}) };
}

/** What deploying the drafts would change: the units, and the latest codebook if it isn't deployed. */
export async function pendingChanges(sql: Sql, jobId: number): Promise<PendingChanges> {
  const deployed = await one<DeploymentRow>(sql, "SELECT * FROM deployments WHERE job_id = $1", [jobId]);
  const latest = await one<{ id: number }>(sql, "SELECT id FROM design_versions WHERE job_id = $1 ORDER BY id DESC LIMIT 1", [jobId]);
  return {
    units: await unitChanges(sql, jobId),
    designVersionId: latest && latest.id !== deployed?.design_version_id ? latest.id : null,
  };
}

/** The deployed versions, newest first. */
export async function deploymentVersions(sql: Sql, jobId: number): Promise<DeploymentVersion[]> {
  const rows = await sql.query<{
    version: number;
    design_version_id: number;
    changes: DeploymentChanges;
    client_release: string | null;
    client_commit: string | null;
    created: Date;
  }>(
    "SELECT version, design_version_id, changes, client_release, client_commit, created FROM deployment_versions WHERE job_id = $1 ORDER BY version DESC",
    [jobId],
  );
  return rows.map((r) => ({
    version: r.version,
    designVersionId: r.design_version_id,
    changes: r.changes,
    client: r.client_release ? { release: r.client_release, commit: r.client_commit ?? "unknown" } : null,
    created: r.created,
  }));
}

/**
 * Loop title (contracts `loopTitle`, made unique) -> names of its questions
 * (through conditions), from a stored codebook. Titles are for people:
 * progress per loop and warnings.
 */
export async function loopVariables(sql: Sql, jobId: number, designVersionId: number): Promise<Map<string, string[]>> {
  const row = await one<{ items: unknown; session: unknown }>(sql, "SELECT items, session FROM design_versions WHERE job_id = $1 AND id = $2", [jobId, designVersionId]);
  const loops = new Map<string, string[]>();
  const parsed = row ? DesignItemsSchema.safeParse(designVersionItems(row)) : null;
  if (!parsed?.success) return loops;
  const questions = (items: DesignItem[]): string[] =>
    items.flatMap((i) => (i.type === "condition" ? questions(i.children as DesignItem[]) : "variable" in i ? [i.name] : []));
  for (const { key, loop } of unitLoops(parsed.data)) {
    const title = loopTitle(loop, key);
    loops.set(loops.has(title) ? `${title} (${key})` : title, questions(loop.children as DesignItem[]));
  }
  return loops;
}

async function reopenWarnings(sql: Sql, jobId: number, previousDesignVersionId: number, designVersionId: number): Promise<string[]> {
  if (previousDesignVersionId === designVersionId) return [];
  const before = await loopVariables(sql, jobId, previousDesignVersionId);
  const after = await loopVariables(sql, jobId, designVersionId);
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
  const codebook = await one<DesignVersionRow>(sql, "SELECT * FROM design_versions WHERE job_id = $1 AND id = $2", [jobId, deployment.design_version_id]);
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
  const codebook = await one<DesignVersionRow>(sql, "SELECT * FROM design_versions WHERE job_id = $1 ORDER BY id DESC LIMIT 1", [jobId]);
  if (!codebook) return null;
  if (!itemsValid(designVersionItems(codebook))) throw new HttpError(409, "The latest design version has issues: fix them to preview it", "design_invalid");
  // The drafts: the latest codebook with the draft units and sets.
  const spec = await buildSpec(sql, jobId, codebook, { version: 1, active: true, annotationEpoch: 0, liveUnits: false });
  const digest = createHash("sha256").update(JSON.stringify([spec.design, spec.sets])).digest("hex");
  return { ...spec, version: (parseInt(digest.slice(0, 7), 16) % 2 ** 30) + 1 };
}

async function buildSpec(
  sql: Sql,
  jobId: number,
  codebook: DesignVersionRow,
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
    design: { ...toDesignVersion(codebook), items: designVersionItems(codebook) },
    sets: await runtimeSets(sql, jobId, meta.liveUnits),
  };
}
