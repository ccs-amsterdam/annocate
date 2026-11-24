import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deployments, studies } from "../db/schema/index.js";
import type { DeploymentStatus } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { DeploymentRuntime, DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime.js";
import { DbStore, type Store } from "./store.js";
import { PreviewStore, previewToken } from "./preview.js";

/** A deployment id: a study's public id, with `.preview` for a researcher preview. */
const DEPLOYMENT_ID = /^([a-z0-9]{12})(\.preview)?$/;

/** Whether a deployment id is a researcher preview's (`<publicId>.preview`). */
export const isPreviewId = (deploymentId: string) => deploymentId.endsWith(".preview");

/**
 * Lazily loads one DeploymentRuntime per deployment, in memory: `<publicId>`
 * (the study's public id, `studies.public_id`), or `<publicId>.preview` for
 * a researcher preview. Runtimes rebuild
 * themselves from the database, so after a restart the first request for a
 * deployment simply loads it again. Deployments unused for
 * `deploymentIdleMs` are dropped.
 */
export class Deployments {
  private runtimes = new Map<string, { runtime: Promise<DeploymentRuntime>; usedAt: number; studyId: number }>();

  constructor(
    private db: Db,
    /** Signs preview tokens. */
    private secret: string,
    private options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
    /** Tests: observe or alter what the runtime reads and writes. */
    private wrapStore: (store: Store) => Store = (store) => store,
  ) {}

  async get(deploymentId: string): Promise<DeploymentRuntime> {
    const match = DEPLOYMENT_ID.exec(deploymentId);
    if (!match) throw new HttpError(404, `Unknown deployment '${deploymentId}'`);
    const now = this.options.now();
    // Idle deployments are forgotten; that includes this one, which then loads afresh.
    for (const [id, entry] of this.runtimes) {
      if (now - entry.usedAt >= this.options.deploymentIdleMs) this.runtimes.delete(id);
    }
    const cached = this.runtimes.get(deploymentId);
    if (cached) {
      cached.usedAt = now;
      return cached.runtime;
    }
    const [study] = await this.db.select({ id: studies.id }).from(studies).where(eq(studies.publicId, match[1]!));
    if (!study) throw new HttpError(404, `Unknown deployment '${deploymentId}'`);
    const studyId = study.id;
    const created = match[2]
      ? this.previewRuntime(deploymentId, studyId)
      : new DeploymentRuntime(deploymentId, this.wrapStore(new DbStore(this.db, studyId)), this.options);
    const loading = created.load().then(() => created);
    this.runtimes.set(deploymentId, { runtime: loading, usedAt: now, studyId });
    // Don't cache failures (e.g. study not deployed): retry on the next request.
    loading.catch(() => {
      if (this.runtimes.get(deploymentId)?.runtime === loading) this.runtimes.delete(deploymentId);
    });
    return loading;
  }

  /**
   * Something coders' runtimes read changed (units, their sets, study settings,
   * a reset): bumps the deployment's revision, so every server process
   * re-reads it on its next request (`DeploymentRuntime.refresh`). Returns
   * the deployment's version.
   */
  async refresh(studyId: number): Promise<number | null> {
    const [row] = await this.db
      .update(deployments)
      .set({ revision: sql`${deployments.revision} + 1` })
      .where(eq(deployments.studyId, studyId))
      .returning({ version: deployments.version });
    return row?.version ?? null;
  }

  /** The id of a study's deployment: its public id. 404 for a study that doesn't exist. */
  async deploymentId(studyId: number): Promise<string> {
    const [study] = await this.db.select({ publicId: studies.publicId }).from(studies).where(eq(studies.id, studyId));
    if (!study) throw new HttpError(404, "Study not found");
    return study.publicId;
  }

  async status(studyId: number): Promise<DeploymentStatus> {
    const runtime = await this.get(await this.deploymentId(studyId));
    await runtime.refresh();
    return runtime.status();
  }

  previewToken(studyId: number, expiresAt: number): string {
    return previewToken(this.secret, studyId, expiresAt);
  }

  /** Forgets a study's deployment and preview, e.g. when the study is deleted. */
  drop(studyId: number): void {
    for (const [id, entry] of this.runtimes) if (entry.studyId === studyId) this.runtimes.delete(id);
  }

  /**
   * A researcher preview (preview.ts): the latest codebook, checked on every
   * request so edits show right away, and coders and answers kept in memory.
   */
  private previewRuntime(deploymentId: string, studyId: number): DeploymentRuntime {
    return new DeploymentRuntime(
      deploymentId,
      this.wrapStore(new PreviewStore(new DbStore(this.db, studyId, true), this.secret, studyId, this.options.now)),
      this.options,
    );
  }
}
