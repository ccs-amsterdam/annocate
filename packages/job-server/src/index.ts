import { serve } from "@hono/node-server";
import { z } from "zod";
import { createJobServer } from "./app.js";
import { SqliteOutboxStore } from "./outboxSqlite.js";

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
const app = createJobServer({ backends, outbox: new SqliteOutboxStore(outboxPath) });
void app.resumePending();
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
