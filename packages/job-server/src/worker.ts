import { z } from "zod";
import { createJobServer } from "./app.js";
import { DurableObjectOutboxStore, type SqlStorage } from "./outboxDurable.js";
import type { RuntimeOptions } from "./runtime.js";
import { SigningKeys } from "./keys.js";

// Cloudflare entry (docs/architecture.md §4, wrangler.toml). The Worker only
// routes: every request for a deployment goes to that deployment's Durable
// Object, a single instance worldwide that runs the same Hono app as the
// Node server (app.ts) for that one deployment. Its memory is a cache the
// platform may drop when idle (the runtime rebuilds from the db server); its
// SQLite storage holds the outbox, flushed by alarms.

// Minimal shapes of the Workers runtime types used here.
/** Opaque to us. */
type DurableObjectId = object;
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
  jurisdiction?(name: string): DurableObjectNamespace;
}
interface DurableObjectState {
  storage: {
    sql: SqlStorage;
    getAlarm(): Promise<number | null>;
    setAlarm(at: number): Promise<void>;
  };
}

interface Env {
  DEPLOYMENTS: DurableObjectNamespace;
  /** JSON: `{"amcat":{"url":"https://..."}}`, as ANNOTINDER_BACKENDS on Node. */
  ANNOTINDER_BACKENDS: string;
  /** This job server's own URL, as db servers bind jobs to it. */
  ANNOTINDER_PUBLIC_URL: string;
  /** Secret: this job server's private keys (keys.ts). Required here: every isolate must sign with the same key. */
  ANNOTINDER_SIGNING_KEYS: string;
  /** E.g. "eu": keep Durable Objects (memory and outbox) in that jurisdiction. */
  DO_JURISDICTION?: string;
  /** Override for tests and dev; production uses the default (a minute). */
  FLUSH_INTERVAL_MS?: string;
}

const BackendsSchema = z.record(z.string().regex(/^[a-zA-Z0-9_-]+$/), z.object({ url: z.string().url() }));

/** Parsed once per isolate (Worker and Durable Objects alike). */
let signingKeys: Promise<SigningKeys> | undefined;
function keysFrom(env: Env): Promise<SigningKeys> {
  if (!env.ANNOTINDER_SIGNING_KEYS) throw new Error("ANNOTINDER_SIGNING_KEYS is not set (npx wrangler secret put ANNOTINDER_SIGNING_KEYS)");
  return (signingKeys ??= SigningKeys.fromJson(env.ANNOTINDER_SIGNING_KEYS));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/.well-known/jwks.json") return Response.json((await keysFrom(env)).jwks());
    const match = /^\/(?:d|admin\/deployments)\/([^/]+)/.exec(pathname);
    if (!match) return Response.json({ ok: true, service: "annotinder-job-server" });
    const namespace = env.DO_JURISDICTION ? env.DEPLOYMENTS.jurisdiction!(env.DO_JURISDICTION) : env.DEPLOYMENTS;
    return namespace.get(namespace.idFromName(decodeURIComponent(match[1]))).fetch(request);
  },
};

/** One deployment (`<backend>.<jobId>`, or a `.preview`). */
export class DeploymentObject {
  private app: ReturnType<typeof createJobServer>;
  /** Outbox timers (`fn` only matters on Node: here the alarm flushes everything due). */
  private timers: { at: number; fn: () => void }[] = [];

  constructor(
    private ctx: DurableObjectState,
    env: Env,
  ) {
    const runtime: Partial<RuntimeOptions> = {
      schedule: (fn, ms) => this.schedule(fn, ms),
      // The platform evicts idle objects itself.
      deploymentIdleMs: Number.POSITIVE_INFINITY,
      ...(env.FLUSH_INTERVAL_MS ? { flushIntervalMs: Number(env.FLUSH_INTERVAL_MS) } : {}),
    };
    this.app = createJobServer({
      backends: BackendsSchema.parse(JSON.parse(env.ANNOTINDER_BACKENDS)),
      publicUrl: env.ANNOTINDER_PUBLIC_URL,
      outbox: new DurableObjectOutboxStore(ctx.storage.sql),
      signingKeys: keysFrom(env),
      runtime,
    });
  }

  fetch(request: Request): Promise<Response> | Response {
    return this.app.fetch(request);
  }

  /**
   * Sends what the outbox holds, and waits for it (the object may be evicted
   * once the alarm handler returns). This also covers an object evicted
   * since the alarm was set: timers are memory, the outbox is not. A failed
   * send schedules its retry, which re-arms the alarm.
   */
  async alarm(): Promise<void> {
    this.timers = this.timers.filter((t) => t.at > Date.now());
    await this.app.flushPending();
    await this.armAlarm();
  }

  private schedule(fn: () => void, ms: number): () => void {
    const timer = { at: Date.now() + ms, fn };
    this.timers.push(timer);
    void this.armAlarm();
    return () => {
      this.timers = this.timers.filter((t) => t !== timer);
    };
  }

  private async armAlarm(): Promise<void> {
    if (this.timers.length === 0) return;
    const next = Math.min(...this.timers.map((t) => t.at));
    const current = await this.ctx.storage.getAlarm();
    if (current === null || next < current) await this.ctx.storage.setAlarm(next);
  }
}
