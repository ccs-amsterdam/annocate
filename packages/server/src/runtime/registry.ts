import type { DatabaseSync } from "node:sqlite";
import type { DeploymentStatus } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { getDeployment } from "../shared/deployments.js";
import { DeploymentRuntime, DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime.js";
import { DbStore, type Store } from "./store.js";
import { PreviewStore, previewToken } from "./preview.js";

/**
 * Lazily loads one DeploymentRuntime per deployment, in memory: `<jobId>`,
 * or `<jobId>.preview` for a researcher preview. Runtimes rebuild
 * themselves from the database, so after a restart the first request for a
 * deployment simply loads it again. Deployments unused for
 * `deploymentIdleMs` are dropped.
 */
export class Deployments {
  private runtimes = new Map<string, { runtime: Promise<DeploymentRuntime>; usedAt: number }>();

  constructor(
    private db: DatabaseSync,
    /** Signs preview tokens. */
    private secret: string,
    private options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
    /** Tests: observe or alter what the runtime reads and writes. */
    private wrapStore: (store: Store) => Store = (store) => store,
  ) {}

  async get(deploymentId: string): Promise<DeploymentRuntime> {
    const match = /^(\d+)(\.preview)?$/.exec(deploymentId);
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
    const jobId = Number(match[1]);
    const created = match[2] ? this.previewRuntime(deploymentId, jobId) : new DeploymentRuntime(deploymentId, this.wrapStore(new DbStore(this.db, jobId)), this.options);
    const loading = created.load().then(() => created);
    this.runtimes.set(deploymentId, { runtime: loading, usedAt: now });
    // Don't cache failures (e.g. job not deployed): retry on the next request.
    loading.catch(() => {
      if (this.runtimes.get(deploymentId)?.runtime === loading) this.runtimes.delete(deploymentId);
    });
    return loading;
  }

  /**
   * Re-reads a job's deployment now if it is loaded (otherwise it is read
   * when it is first used); `units` also drops cached unit content. Returns
   * the deployment's version.
   */
  async refresh(jobId: number, units?: number[] | "all"): Promise<number | null> {
    const loaded = this.runtimes.get(String(jobId));
    const runtime = loaded && (await loaded.runtime.catch(() => null));
    if (!runtime) return getDeployment(this.db, jobId)?.version ?? null;
    if (units) runtime.clearUnits(units);
    await runtime.refresh(true);
    return runtime.version;
  }

  async status(jobId: number): Promise<DeploymentStatus> {
    const runtime = await this.get(String(jobId));
    await runtime.refresh();
    return runtime.status();
  }

  previewToken(jobId: number, expiresAt: number): string {
    return previewToken(this.secret, jobId, expiresAt);
  }

  /** Forgets a job's deployment and preview, e.g. when the job is deleted. */
  drop(jobId: number): void {
    this.runtimes.delete(String(jobId));
    this.runtimes.delete(`${jobId}.preview`);
  }

  /**
   * A researcher preview (preview.ts): the latest codebook, checked on every
   * request so edits show right away, and coders and answers kept in memory.
   */
  private previewRuntime(deploymentId: string, jobId: number): DeploymentRuntime {
    const options: RuntimeOptions = { ...this.options, specTtlMs: 0 };
    return new DeploymentRuntime(deploymentId, this.wrapStore(new PreviewStore(new DbStore(this.db, jobId, true), this.secret, jobId, options.now)), options);
  }
}
