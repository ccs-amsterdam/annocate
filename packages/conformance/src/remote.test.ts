import { createServer } from "node:http";
import { afterAll, it } from "vitest";
import { conformanceSuite } from "./index.js";

// Runs the suite against a db server over HTTP:
//
//   DB_SERVER_URL=http://localhost:8790 DB_SERVER_SECRET=... DB_SERVER_JOB_ID=1 \
//     pnpm --filter @annotinder/conformance test:remote
//
// The server must have loaded fixture.json freshly (some tests use up invites).
//
// Job token tests: set JOB_SERVER_PORT. The suite then serves its JWKS on
// that port, playing the job server the fixture's job must be bound to:
// JOB_SERVER_URL (default http://localhost:<port>). DB_SERVER_PUBLIC_URL is
// the URL the db server knows itself by (default DB_SERVER_URL).

const url = process.env.DB_SERVER_URL;

if (url) {
  let jwks: object = { keys: [] };
  const port = process.env.JOB_SERVER_PORT ? Number(process.env.JOB_SERVER_PORT) : null;
  const jobServer =
    port === null
      ? null
      : createServer((req, res) => {
          if (req.url === "/.well-known/jwks.json") {
            res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(jwks));
          } else res.writeHead(404).end();
        }).listen(port);
  afterAll(() => void jobServer?.close());

  conformanceSuite(() => ({
    baseUrl: url.replace(/\/$/, ""),
    jobId: Number(process.env.DB_SERVER_JOB_ID ?? 1),
    secret: process.env.DB_SERVER_SECRET ?? "",
    ...(port !== null && {
      tokens: {
        jobServerUrl: process.env.JOB_SERVER_URL ?? `http://localhost:${port}`,
        dbServerUrl: (process.env.DB_SERVER_PUBLIC_URL ?? url).replace(/\/$/, ""),
        serveJwks: (keys: object) => void (jwks = keys),
      },
    }),
  }));
} else {
  it.skip("set DB_SERVER_URL (and DB_SERVER_SECRET, DB_SERVER_JOB_ID) to run against a db server", () => {});
}
