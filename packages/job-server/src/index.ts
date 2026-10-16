import { serve } from "@hono/node-server";
import { z } from "zod";
import { createJobServer } from "./app.js";
import { SqliteOutboxStore } from "./outboxSqlite.js";
import { SigningKeys } from "./keys.js";

// Node entry point. Backends (db servers) are configured as JSON:
//   ANNOTINDER_BACKENDS='{"mock":{"url":"http://localhost:8787","secret":"..."}}'
// A deployment id is `<backend name>.<jobId>`, e.g. `mock.1`.

const BackendsSchema = z.record(z.string().regex(/^[a-zA-Z0-9_-]+$/), z.object({ url: z.string().url(), secret: z.string().min(1) }));

const backends = BackendsSchema.parse(
  JSON.parse(
    process.env.ANNOTINDER_BACKENDS ??
      JSON.stringify({ mock: { url: "http://localhost:8787", secret: "dev-job-server-secret" } }),
  ),
);

// Pending writes to db servers survive restarts in this file.
const outboxPath = process.env.ANNOTINDER_OUTBOX ?? "job-server-outbox.sqlite";

// This job server's identity towards db servers (keys.ts).
const signingKeys = process.env.ANNOTINDER_SIGNING_KEYS
  ? await SigningKeys.fromJson(process.env.ANNOTINDER_SIGNING_KEYS)
  : await SigningKeys.ephemeral();
if (!process.env.ANNOTINDER_SIGNING_KEYS) {
  console.warn("ANNOTINDER_SIGNING_KEYS is not set: using a key that changes on every restart (fine for development)");
}

const app = createJobServer({ backends, outbox: new SqliteOutboxStore(outboxPath), signingKeys });
void app.flushPending();
const port = Number(process.env.PORT ?? 8788);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/job-server listening on http://localhost:${info.port}`);
  console.log(`  backends: ${Object.entries(backends).map(([name, b]) => `${name} -> ${b.url}`).join(", ")}`);
  console.log(`  outbox: ${outboxPath}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
