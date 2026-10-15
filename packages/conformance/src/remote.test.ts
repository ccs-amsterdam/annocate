import { it } from "vitest";
import { conformanceSuite } from "./index.js";

// Runs the suite against a db server over HTTP:
//
//   DB_SERVER_URL=http://localhost:8790 DB_SERVER_SECRET=... DB_SERVER_JOB_ID=1 \
//     pnpm --filter @annotinder/conformance test:remote
//
// The server must have loaded fixture.json freshly (some tests use up invites).

const url = process.env.DB_SERVER_URL;

if (url) {
  conformanceSuite(() => ({
    baseUrl: url.replace(/\/$/, ""),
    jobId: Number(process.env.DB_SERVER_JOB_ID ?? 1),
    secret: process.env.DB_SERVER_SECRET ?? "",
  }));
} else {
  it.skip("set DB_SERVER_URL (and DB_SERVER_SECRET, DB_SERVER_JOB_ID) to run against a db server", () => {});
}
