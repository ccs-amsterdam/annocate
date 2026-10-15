import { BackendClient, HttpError, type BackendConfig } from "./backend.js";
import { DeploymentRuntime, DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime.js";
import { MemoryOutboxStore, Outbox, type OutboxStore } from "./outbox.js";
import { PreviewBackend } from "./preview.js";

/** Splits a deployment id `<backend>.<jobId>`, or a researcher preview `<backend>.<jobId>.preview`. */
export function parseDeploymentId(id: string): { backend: string; jobId: number; preview: boolean } | null {
  const match = /^([a-zA-Z0-9_-]+)\.(\d+)(\.preview)?$/.exec(id);
  if (!match) return null;
  return { backend: match[1], jobId: Number(match[2]), preview: !!match[3] };
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
  /**
   * One outbox per deployment, kept across runtime reloads: two outboxes
   * sending the same pending writes could deliver an old write after a newer
   * one.
   */
  private outboxes = new Map<string, Outbox>();

  constructor(
    private backends: Record<string, BackendConfig>,
    private fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    private runtimeOptions: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
    /** Pending writes of all deployments; durable outside tests (outboxSqlite.ts). */
    private outboxStore: OutboxStore = new MemoryOutboxStore(),
  ) {}

  /**
   * Sends the pending writes of every deployment that has any (e.g. after a
   * restart while the db server was down, or when an alarm fires). Loading a
   * deployment sends them first; a failure leaves them for the outbox's
   * retry, the next request, or the next call.
   */
  async flushPending(): Promise<void> {
    await Promise.all(
      this.outboxStore.deployments().map(async (id) => {
        const runtime = await this.get(id).catch(() => null);
        await runtime?.outbox.flush().catch(() => undefined);
      }),
    );
  }

  backendFor(deploymentId: string): BackendConfig & { jobId: number; preview: boolean } {
    const parsed = parseDeploymentId(deploymentId);
    const backend = parsed && this.backends[parsed.backend];
    if (!parsed || !backend) throw new HttpError(404, `Unknown deployment '${deploymentId}'`);
    return { ...backend, jobId: parsed.jobId, preview: parsed.preview };
  }

  async get(deploymentId: string): Promise<DeploymentRuntime> {
    const now = this.runtimeOptions.now();
    // Idle deployments are forgotten; that includes this one, which then loads afresh.
    for (const [id, entry] of this.runtimes) {
      if (now - entry.usedAt < this.runtimeOptions.deploymentIdleMs) continue;
      this.runtimes.delete(id);
      if (this.outboxes.get(id)?.status().pending === 0) this.outboxes.delete(id);
    }
    const cached = this.runtimes.get(deploymentId);
    if (cached) cached.usedAt = now;
    let runtime = cached?.runtime;
    if (!runtime) {
      const { jobId, preview, ...config } = this.backendFor(deploymentId);
      const created = preview ? this.previewRuntime(deploymentId, config, jobId) : this.deploymentRuntime(deploymentId, config, jobId);
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

  private deploymentRuntime(deploymentId: string, config: BackendConfig, jobId: number): DeploymentRuntime {
    const backend = new BackendClient(config, jobId, this.fetchImpl);
    let outbox = this.outboxes.get(deploymentId);
    if (!outbox) this.outboxes.set(deploymentId, (outbox = new Outbox(deploymentId, this.outboxStore, backend, this.runtimeOptions)));
    return new DeploymentRuntime(deploymentId, backend, this.runtimeOptions, outbox);
  }

  /**
   * A researcher preview (preview.ts): the latest codebook, checked on every
   * request so edits show right away, and coders and answers kept in memory.
   */
  private previewRuntime(deploymentId: string, config: BackendConfig, jobId: number): DeploymentRuntime {
    const options: RuntimeOptions = { ...this.runtimeOptions, specTtlMs: 0, flushIntervalMs: 0 };
    const db = new BackendClient(config, jobId, this.fetchImpl, true);
    const backend = new PreviewBackend(db, config.secret, jobId, options.now);
    return new DeploymentRuntime(deploymentId, backend, options, new Outbox(deploymentId, new MemoryOutboxStore(), backend, options));
  }

  /** Forgets a deployment, dropping all its cached units and annotations. */
  drop(deploymentId: string): void {
    this.runtimes.delete(deploymentId);
  }
}
