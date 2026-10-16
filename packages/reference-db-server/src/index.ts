import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { ConformanceFixtureSchema } from "@annotinder/contracts";
import { JobTokenIssuer } from "./jobTokens.js";
import { createServer, loadFixture } from "./server.js";

// Serves the reference db server for one job loaded from a fixture file:
//   FIXTURE=path/to/fixture.json SECRET=... PORT=8790 pnpm --filter @annotinder/reference-db-server dev
// Defaults to the conformance fixture (packages/conformance/fixture.json).
// Job tokens (plan §13): the job is bound to JOB_SERVER_URL; tokens are
// signed with TOKEN_SECRET; job servers address this server as PUBLIC_URL.

const path = process.env.FIXTURE ?? new URL("../../conformance/fixture.json", import.meta.url);
const fixture = ConformanceFixtureSchema.parse(JSON.parse(readFileSync(path, "utf8")));
const secret = process.env.SECRET ?? "dev-job-server-secret";
const port = Number(process.env.PORT ?? 8790);
const tokens = new JobTokenIssuer({
  secret: process.env.TOKEN_SECRET ?? "dev-token-secret",
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
});
const jobServerUrl = process.env.JOB_SERVER_URL ?? "http://localhost:8788";

serve({ fetch: createServer(loadFixture(fixture, 1, jobServerUrl), secret, tokens).fetch, port }, (info) => {
  console.log(`@annotinder/reference-db-server: job 1 ("${fixture.job.name}") on http://localhost:${info.port}`);
  console.log(`  bound to job server ${jobServerUrl}`);
});
