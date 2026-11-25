import { randomBytes } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../context.js";

// One log line per API request: method, path, status, duration and the
// request's id, e.g. `GET /api/study/3/units 200 12ms 9f2c1a7b04d1`. Never
// the query string (coder links carry their secret and panel ids there),
// bodies, headers or addresses. The id is also in the `X-Request-Id` response
// header, in the body of a 500 and in the error log (app.ts), so a report of
// "Internal error" leads to its lines.

/** Paths that hold a secret: logged up to it. */
const SECRET_PATHS: [path: RegExp, logged: string][] = [
  // A download link's token (shared/files.ts)
  [/^\/api\/files\/.*/, "/api/files/…"],
];

/** The container's own check, every few seconds: not logged while it succeeds. */
const QUIET_PATH = "/api/health";

/** What the log says of a path. */
export function loggedPath(path: string): string {
  for (const [pattern, logged] of SECRET_PATHS) if (pattern.test(path)) return logged;
  return path;
}

/**
 * Gives every request an id (`requestId`, `X-Request-Id`) and writes its line
 * with `log` when the response is ready; without `log` (tests) only the id.
 */
export function requestLog(log: ((line: string) => void) | undefined): MiddlewareHandler<Env> {
  return async (c, next) => {
    const id = randomBytes(6).toString("hex");
    c.set("requestId", id);
    c.header("X-Request-Id", id);
    const started = performance.now();
    await next();
    if (!log || (c.req.path === QUIET_PATH && c.res.ok)) return;
    const ms = Math.round(performance.now() - started);
    log(`${c.req.method} ${loggedPath(c.req.path)} ${c.res.status} ${ms}ms ${id}`);
  };
}
