import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { CONTRACTS_VERSION } from "@annotinder/contracts";

// Phase 2 will flesh this out into the full mock server (SQLite-backed,
// implementing every endpoint from the contracts package). For now this is a
// scaffolding placeholder so the workspace runs end-to-end.
const app = new Hono();

app.get("/", (c) => c.json({ ok: true, contractsVersion: CONTRACTS_VERSION }));

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/mock-server listening on http://localhost:${info.port}`);
});
