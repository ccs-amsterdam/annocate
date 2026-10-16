import { lookup } from "node:dns/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { createJobServer } from "./app.js";
import { SqliteOutboxStore } from "./outboxSqlite.js";
import { SigningKeys } from "./keys.js";

// Node entry point. The db servers this job server works for:
//   ANNOTINDER_DB_SERVERS='["http://localhost:8787"]'   (an allowlist), or
//   ANNOTINDER_DB_SERVERS=open                         (any https db server)
// A deployment id is `<db host>/<jobId>`, e.g. `localhost:8787/1`.
// ANNOTINDER_PUBLIC_URL is this job server's own URL, as db servers bind
// jobs to it (they fetch its keys from <url>/.well-known/jwks.json).

const DbServersSchema = z.union([z.literal("open"), z.array(z.string().url())]);
const rawDbServers = process.env.ANNOTINDER_DB_SERVERS ?? '["http://localhost:8787"]';
const dbServers = DbServersSchema.parse(rawDbServers === "open" ? "open" : JSON.parse(rawDbServers));

/** Open mode: refuse db hosts that resolve to loopback, private, link-local or metadata addresses. */
async function isPublicHost(host: string): Promise<boolean> {
  const addresses = await lookup(host, { all: true });
  return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
}
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = address.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") ||
    (v6.startsWith("::ffff:") && isPrivateAddress(v6.slice(7)));
}
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

const app = createJobServer({
  dbServers,
  dbServerOptions: { checkHost: isPublicHost },
  publicUrl,
  outbox: new SqliteOutboxStore(outboxPath),
  signingKeys,
});
void app.flushPending();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/job-server listening on http://localhost:${info.port}`);
  console.log(`  db servers: ${dbServers === "open" ? "any (open)" : dbServers.join(", ")}`);
  console.log(`  outbox: ${outboxPath}`);
  console.log(`  public URL: ${publicUrl}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
