import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { ConformanceFixtureSchema } from "@annotinder/contracts";
import { createServer, loadFixture } from "./server.js";

// Serves the reference db server for one job loaded from a fixture file:
//   FIXTURE=path/to/fixture.json SECRET=... PORT=8790 pnpm --filter @annotinder/reference-db-server dev
// Defaults to the conformance fixture (packages/conformance/fixture.json).

const path = process.env.FIXTURE ?? new URL("../../conformance/fixture.json", import.meta.url);
const fixture = ConformanceFixtureSchema.parse(JSON.parse(readFileSync(path, "utf8")));
const secret = process.env.SECRET ?? "dev-job-server-secret";
const port = Number(process.env.PORT ?? 8790);

serve({ fetch: createServer(loadFixture(fixture), secret).fetch, port }, (info) => {
  console.log(`@annotinder/reference-db-server: job 1 ("${fixture.job.name}") on http://localhost:${info.port}`);
});
