import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { createJobServer } from "./app.js";
import { SqliteOutboxStore } from "./outboxSqlite.js";
import { SigningKeys } from "./keys.js";

// Node entry point. Backends (db servers this job server works for) are
// configured as JSON:
//   ANNOTINDER_BACKENDS='{"mock":{"url":"http://localhost:8787"}}'
// A deployment id is `<backend name>.<jobId>`, e.g. `mock.1`.
// ANNOTINDER_PUBLIC_URL is this job server's own URL, as db servers bind
// jobs to it (they fetch its keys from <url>/.well-known/jwks.json).

const BackendsSchema = z.record(z.string().regex(/^[a-zA-Z0-9_-]+$/), z.object({ url: z.string().url() }));

const backends = BackendsSchema.parse(
  JSON.parse(process.env.ANNOTINDER_BACKENDS ?? JSON.stringify({ mock: { url: "http://localhost:8787" } })),
);
const port = Number(process.env.PORT ?? 8788);
const publicUrl = process.env.ANNOTINDER_PUBLIC_URL ?? `http://localhost:${port}`;

// Pending writes to db servers survive restarts in this file.
const outboxPath = process.env.ANNOTINDER_OUTBOX ?? "job-server-outbox.sqlite";

// This job server's identity towards db servers (keys.ts). Without
// ANNOTINDER_SIGNING_KEYS, a key is generated once and kept in a local file
// (development): a new key on every restart would make db servers refetch
// our keys each time.
const keyPath = process.env.ANNOTINDER_SIGNING_KEY_FILE ?? "job-server-signing-key.json";
let keysJson = process.env.ANNOTINDER_SIGNING_KEYS;
if (!keysJson) {
  if (!existsSync(keyPath)) writeFileSync(keyPath, JSON.stringify([await SigningKeys.generate()]), { mode: 0o600 });
  keysJson = readFileSync(keyPath, "utf8");
  console.warn(`ANNOTINDER_SIGNING_KEYS is not set: using the key in ${keyPath} (fine for development)`);
}
const signingKeys = await SigningKeys.fromJson(keysJson);

const app = createJobServer({ backends, publicUrl, outbox: new SqliteOutboxStore(outboxPath), signingKeys });
void app.flushPending();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/job-server listening on http://localhost:${info.port}`);
  console.log(`  backends: ${Object.entries(backends).map(([name, b]) => `${name} -> ${b.url}`).join(", ")}`);
  console.log(`  outbox: ${outboxPath}`);
  console.log(`  public URL: ${publicUrl}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
