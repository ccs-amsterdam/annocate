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
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  deployments,
  deploymentVersions as deploymentVersionsTable,
  designVersions,
  studies,
} from "../db/schema/index.js";
import { designVersionItems, itemsValid, toDesignVersion, type DesignVersionRow } from "./designVersions.js";
import { HttpError } from "./http.js";
import { listFinished } from "./finished.js";
import type { DeploymentSpec } from "../runtime/types.js";
import { runtimeSets } from "./sets.js";
import { anyUnitChanges, deployDraftUnits, unitChanges } from "./units.js";

/** A study's deployment row, if it is deployed. */
async function deploymentRow(db: Db, studyId: number) {
  const [row] = await db.select().from(deployments).where(eq(deployments.studyId, studyId));
  return row;
}

export async function getDeployment(db: Db, studyId: number): Promise<DeploymentResponse | null> {
  const row = await deploymentRow(db, studyId);
  if (!row) return null;
  return {
    studyId: row.studyId,
    designVersionId: row.designVersionId,
    active: row.active,
    version: row.version,
    updated: row.updated,
  };
}

/** A design version of a study (the latest if `id` is undefined). */
async function designVersion(db: Db, studyId: number, id?: number) {
  const [row] = await db
    .select()
    .from(designVersions)
    .where(and(eq(designVersions.studyId, studyId), id === undefined ? undefined : eq(designVersions.id, id)))
    .orderBy(desc(designVersions.id))
    .limit(1);
  return row;
}

/**
 * Deploys: a design version, with the draft units and sets (`units`, always on
 * the first deploy) or the deployed ones. A new deployment version when the design version
 * or the units change (docs/architecture.md §8.4), recorded with what
 * changed. Freezes the design version. Warns when a loop gains questions while
 * coders already finished units in it: those units count as unfinished
 * again (docs/architecture.md §8.2).
 */
export async function putDeployment(db: Db, studyId: number, body: DeploymentWrite): Promise<DeploymentResponse> {
  const previous = await deploymentRow(db, studyId);
  const warnings = previous ? await reopenWarnings(db, studyId, previous.designVersionId, body.designVersionId) : [];
  const units = !previous || body.units ? await unitChanges(db, studyId) : null;
  const newUnits = units !== null && (!previous || anyUnitChanges(units));
  const changes: DeploymentChanges = {
    design: previous?.designVersionId !== body.designVersionId,
    units: newUnits ? units : null,
  };
  const changed = changes.design || changes.units !== null;
  const version = !previous ? 1 : previous.version + (changed ? 1 : 0);
  // The units of this version: new versions of changed units, the draft's sets
  if (newUnits) await deployDraftUnits(db, studyId, version);
  const deployment = { designVersionId: body.designVersionId, active: body.active, version, updated: sql`now()` };
  await db
    .insert(deployments)
    .values({ studyId, ...deployment })
    .onConflictDoUpdate({ target: deployments.studyId, set: deployment });
  if (!previous || changed) {
    await db.insert(deploymentVersionsTable).values({
      studyId,
      version,
      designVersionId: body.designVersionId,
      changes,
      clientRelease: CLIENT_VERSION.release,
      clientCommit: CLIENT_VERSION.commit,
    });
  }
  await db
    .update(designVersions)
    .set({ immutable: true })
    .where(and(eq(designVersions.studyId, studyId), eq(designVersions.id, body.designVersionId)));
  return { ...(await getDeployment(db, studyId))!, ...(warnings.length > 0 ? { warnings } : {}) };
}

/** What deploying the drafts would change: the units, and the latest design version if it isn't deployed. */
export async function pendingChanges(db: Db, studyId: number): Promise<PendingChanges> {
  const deployed = await deploymentRow(db, studyId);
  const latest = await designVersion(db, studyId);
  return {
    units: await unitChanges(db, studyId),
    designVersionId: latest && latest.id !== deployed?.designVersionId ? latest.id : null,
  };
}

/** The deployed versions, newest first. */
export async function deploymentVersions(db: Db, studyId: number): Promise<DeploymentVersion[]> {
  const rows = await db
    .select()
    .from(deploymentVersionsTable)
    .where(eq(deploymentVersionsTable.studyId, studyId))
    .orderBy(desc(deploymentVersionsTable.version));
  return rows.map((r) => ({
    version: r.version,
    designVersionId: r.designVersionId,
    changes: r.changes,
    client: r.clientRelease ? { release: r.clientRelease, commit: r.clientCommit ?? "unknown" } : null,
    created: r.created,
  }));
}

/**
 * Loop title (contracts `loopTitle`, made unique) -> names of its questions
 * (through conditions), from a stored design version. Titles are for people:
 * progress per loop and warnings.
 */
export async function loopVariables(db: Db, studyId: number, designVersionId: number): Promise<Map<string, string[]>> {
  const row = await designVersion(db, studyId, designVersionId);
  const loops = new Map<string, string[]>();
  const parsed = row ? DesignItemsSchema.safeParse(designVersionItems(row)) : null;
  if (!parsed?.success) return loops;
  const questions = (items: DesignItem[]): string[] =>
    items.flatMap((i) =>
      i.type === "show_if" ? questions(i.children as DesignItem[]) : "variable" in i ? [i.name] : [],
    );
  for (const { key, loop } of unitLoops(parsed.data)) {
    const title = loopTitle(loop, key);
    loops.set(loops.has(title) ? `${title} (${key})` : title, questions(loop.children as DesignItem[]));
  }
  return loops;
}

/** For each loop that gained questions while coders had finished units in it: a warning (those units reopen). */
async function reopenWarnings(
  db: Db,
  studyId: number,
  previousDesignVersionId: number,
  designVersionId: number,
): Promise<string[]> {
  if (previousDesignVersionId === designVersionId) return [];
  const before = await loopVariables(db, studyId, previousDesignVersionId);
  const after = await loopVariables(db, studyId, designVersionId);
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
    const finished = (await listFinished(db, studyId, { loops: [{ level: "unit", loop, variables: previous }] }))
      .length;
    if (finished > 0) {
      warnings.push(
        `Loop '${loop}' gained questions (${added.join(", ")}): ${finished} finished unit codings ` +
          `will be unfinished again, and coders get these units back to answer the new questions.`,
      );
    }
  }
  return warnings;
}

/** Everything the runtime needs to run a deployed study. */
export async function getDeploymentSpec(db: Db, studyId: number): Promise<DeploymentSpec | null> {
  const deployment = await deploymentRow(db, studyId);
  if (!deployment) return null;
  const versionRow = await designVersion(db, studyId, deployment.designVersionId);
  if (!versionRow) return null;
  return buildSpec(db, studyId, versionRow, {
    version: deployment.version,
    active: deployment.active,
    annotationEpoch: deployment.annotationEpoch,
    liveUnits: true,
  });
}

/**
 * The spec for previewing: the study's latest design version, deployed or not,
 * always active. Its `version` is derived from the content, so the preview
 * picks up every edit.
 */
export async function getPreviewSpec(db: Db, studyId: number): Promise<DeploymentSpec | null> {
  const versionRow = await designVersion(db, studyId);
  if (!versionRow) return null;
  if (!itemsValid(designVersionItems(versionRow)))
    throw new HttpError(409, "The latest design version has issues: fix them to preview it", "design_invalid");
  // The drafts: the latest design version with the draft units and sets.
  const spec = await buildSpec(db, studyId, versionRow, {
    version: 1,
    active: true,
    annotationEpoch: 0,
    liveUnits: false,
  });
  const digest = createHash("sha256")
    .update(JSON.stringify([spec.design, spec.sets]))
    .digest("hex");
  return { ...spec, version: (parseInt(digest.slice(0, 7), 16) % 2 ** 30) + 1 };
}

/** A deployment spec for a design version, with the study's settings and the deployed (`liveUnits`) or draft sets. */
async function buildSpec(
  db: Db,
  studyId: number,
  versionRow: DesignVersionRow,
  meta: Pick<DeploymentSpec, "version" | "active" | "annotationEpoch" | "liveUnits">,
): Promise<DeploymentSpec> {
  const [study] = await db
    .select({ keepSessionsOpen: studies.keepSessionsOpen, redirectUrls: studies.redirectUrls })
    .from(studies)
    .where(eq(studies.id, studyId));
  return {
    studyId,
    ...meta,
    keepSessionsOpen: study?.keepSessionsOpen ?? false,
    redirectUrls: study?.redirectUrls ?? {},
    // The runtime works on the items with the session first
    design: { ...toDesignVersion(versionRow), items: designVersionItems(versionRow) },
    sets: await runtimeSets(db, studyId, meta.liveUnits),
  };
}
