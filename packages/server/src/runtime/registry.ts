import { one, type Sql } from "../db.js";
import type { DeploymentStatus } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { DeploymentRuntime, DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime.js";
import { DbStore, type Store } from "./store.js";
import { PreviewStore, previewToken } from "./preview.js";

/**
 * Lazily loads one DeploymentRuntime per deployment, in memory: `<studyId>`,
 * or `<studyId>.preview` for a researcher preview. Runtimes rebuild
 * themselves from the database, so after a restart the first request for a
 * deployment simply loads it again. Deployments unused for
 * `deploymentIdleMs` are dropped.
 */
export class Deployments {
  private runtimes = new Map<string, { runtime: Promise<DeploymentRuntime>; usedAt: number }>();

  constructor(
    private db: Sql,
    /** Signs preview tokens. */
    private secret: string,
    private options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
    /** Tests: observe or alter what the runtime reads and writes. */
    private wrapStore: (store: Store) => Store = (store) => store,
  ) {}

  async get(deploymentId: string): Promise<DeploymentRuntime> {
    // One spelling per study (no leading zeros): each id is a runtime in memory.
    const match = /^([1-9]\d{0,9})(\.preview)?$/.exec(deploymentId);
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
    const studyId = Number(match[1]);
    const created = match[2] ? this.previewRuntime(deploymentId, studyId) : new DeploymentRuntime(deploymentId, this.wrapStore(new DbStore(this.db, studyId)), this.options);
    const loading = created.load().then(() => created);
    this.runtimes.set(deploymentId, { runtime: loading, usedAt: now });
    // Don't cache failures (e.g. study not deployed): retry on the next request.
    loading.catch(() => {
      if (this.runtimes.get(deploymentId)?.runtime === loading) this.runtimes.delete(deploymentId);
    });
    return loading;
  }

  /**
   * Something coders' runtimes read changed (units, set groups, study settings,
   * a reset): bumps the deployment's revision, so every server process
   * re-reads it on its next request (`DeploymentRuntime.refresh`). Returns
   * the deployment's version.
   */
  async refresh(studyId: number): Promise<number | null> {
    const row = await one<{ version: number }>(this.db, "UPDATE deployments SET revision = revision + 1 WHERE study_id = $1 RETURNING version", [studyId]);
    return row?.version ?? null;
  }

  async status(studyId: number): Promise<DeploymentStatus> {
    const runtime = await this.get(String(studyId));
    await runtime.refresh();
    return runtime.status();
  }

  previewToken(studyId: number, expiresAt: number): string {
    return previewToken(this.secret, studyId, expiresAt);
  }

  /** Forgets a study's deployment and preview, e.g. when the study is deleted. */
  drop(studyId: number): void {
    this.runtimes.delete(String(studyId));
    this.runtimes.delete(`${studyId}.preview`);
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
