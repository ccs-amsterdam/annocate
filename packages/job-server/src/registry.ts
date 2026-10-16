import { BackendClient, HttpError, type BackendConfig } from "./backend.js";
import { parseDeploymentId, type DbServers } from "./dbServers.js";
import { DeploymentRuntime, DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime.js";
import { MemoryOutboxStore, Outbox, type OutboxStore } from "./outbox.js";
import { PreviewBackend } from "./preview.js";
import { JobTokens } from "./jobTokens.js";
import type { SigningKeys } from "./keys.js";

/** Who this job server is towards db servers (plan §13). */
export interface JobServerIdentity {
  /** Its own URL, as db servers bind jobs to it. */
  publicUrl: string;
  keys: Promise<SigningKeys>;
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
  /** `<db URL>|<jobId>` -> the job's token; shared by the deployment and its preview. */
  private tokens = new Map<string, JobTokens>();

  constructor(
    /** The db servers this job server works for; all calls to them go through its `fetch`. */
    private dbServers: DbServers,
    private identity: JobServerIdentity,
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
    if (!parsed) throw new HttpError(404, `Unknown deployment '${deploymentId}'`);
    return { url: this.dbServers.urlFor(parsed.host), jobId: parsed.jobId, preview: parsed.preview };
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

  /** The job token for a deployment (or its preview): the call key db server calls are signed with. */
  tokensFor(deploymentId: string): JobTokens {
    const { jobId, url } = this.backendFor(deploymentId);
    const key = `${url}|${jobId}`;
    let tokens = this.tokens.get(key);
    if (!tokens) {
      tokens = new JobTokens({
        publicUrl: this.identity.publicUrl,
        dbUrl: url,
        jobId,
        keys: this.identity.keys,
        fetch: this.dbServers.fetch,
      });
      this.tokens.set(key, tokens);
    }
    return tokens;
  }

  private deploymentRuntime(deploymentId: string, config: BackendConfig, jobId: number): DeploymentRuntime {
    const backend = new BackendClient(config, jobId, this.tokensFor(deploymentId), this.dbServers.fetch);
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
    const tokens = this.tokensFor(deploymentId);
    const db = new BackendClient(config, jobId, tokens, this.dbServers.fetch, true);
    const backend = new PreviewBackend(db, () => tokens.callKey(), jobId, options.now);
    return new DeploymentRuntime(deploymentId, backend, options, new Outbox(deploymentId, new MemoryOutboxStore(), backend, options));
  }

  /** Forgets a deployment, dropping all its cached units and annotations. */
  drop(deploymentId: string): void {
    this.runtimes.delete(deploymentId);
  }
}
