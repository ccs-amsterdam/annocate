import { BackendClient, HttpError, type BackendConfig } from "./backend.js";
import { DeploymentRuntime, DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime.js";

/** Splits a deployment id `<backend>.<jobId>` into its parts. */
export function parseDeploymentId(id: string): { backend: string; jobId: number } | null {
  const match = /^([a-zA-Z0-9_-]+)\.(\d+)$/.exec(id);
  if (!match) return null;
  return { backend: match[1], jobId: Number(match[2]) };
}

/**
 * Lazily loads one DeploymentRuntime per deployment id, in memory. Because
 * runtimes rebuild themselves from the db server, nothing here is persisted:
 * after a restart the first request for a deployment simply loads it again.
 * Deployments unused for `deploymentIdleMs` are dropped (on Cloudflare the
 * platform does this, by evicting idle Durable Objects).
 */
export class DeploymentRegistry {
  private runtimes = new Map<string, { runtime: Promise<DeploymentRuntime>; usedAt: number }>();

  constructor(
    private backends: Record<string, BackendConfig>,
    private fetchImpl: typeof fetch = fetch,
    private runtimeOptions: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
  ) {}

  backendFor(deploymentId: string): BackendConfig & { jobId: number } {
    const parsed = parseDeploymentId(deploymentId);
    const backend = parsed && this.backends[parsed.backend];
    if (!parsed || !backend) throw new HttpError(404, `Unknown deployment '${deploymentId}'`);
    return { ...backend, jobId: parsed.jobId };
  }

  async get(deploymentId: string): Promise<DeploymentRuntime> {
    const now = this.runtimeOptions.now();
    // Idle deployments are forgotten; that includes this one, which then loads afresh.
    for (const [id, entry] of this.runtimes) {
      if (now - entry.usedAt >= this.runtimeOptions.deploymentIdleMs) this.runtimes.delete(id);
    }
    const cached = this.runtimes.get(deploymentId);
    if (cached) cached.usedAt = now;
    let runtime = cached?.runtime;
    if (!runtime) {
      const { jobId, ...config } = this.backendFor(deploymentId);
      const created = new DeploymentRuntime(
        deploymentId,
        new BackendClient(config, jobId, this.fetchImpl),
        this.runtimeOptions,
      );
      const loading = created.load().then(() => created);
      runtime = loading;
      this.runtimes.set(deploymentId, { runtime, usedAt: now });
      // Don't cache failures (db server down, job not deployed): retry on the next request.
      loading.catch(() => {
        if (this.runtimes.get(deploymentId)?.runtime === loading) this.runtimes.delete(deploymentId);
      });
    }
    return runtime;
  }

  /** Forgets a deployment, dropping all its cached units and annotations. */
  drop(deploymentId: string): void {
    this.runtimes.delete(deploymentId);
  }
}
