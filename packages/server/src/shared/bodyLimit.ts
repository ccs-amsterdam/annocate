import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

// How large a request body may be, per route. Bodies are read whole into
// memory, so only the routes that take a study's units get the large limit
// (each unit is also checked against the server's unit size, shared/limits.ts).

const KB = 1024;
const MB = 1024 * KB;

/** The largest body (bytes) per route under /api: the first pattern that matches the path counts. */
const BODY_LIMITS: [path: RegExp, bytes: number][] = [
  // All of a study's units at once: an upload, an imported study, a study from an R or Python recipe
  [/^\/api\/study\/[0-9]+\/units$/, 256 * MB],
  [/^\/api\/study\/(import|from-recipe)$/, 256 * MB],
  // Designs, sets and the rest of the researcher API
  [/^\/api\/study(\/|$)/, 4 * MB],
  // A coder sends one unit's answers at a time
  [/^\/api\/d\//, 2 * MB],
  [/^\/api\/admin\//, 1 * MB],
];
/** Everything else (a coder's settings, account requests, logging out). */
const DEFAULT_BODY_LIMIT = 64 * KB;

/** The largest body (bytes) a request to `path` may have. */
export function bodyLimitOf(path: string): number {
  return BODY_LIMITS.find(([pattern]) => pattern.test(path))?.[1] ?? DEFAULT_BODY_LIMIT;
}

const tooLarge = (c: Context) => c.json({ error: "The request is too large", code: "request_too_large" }, 413);

/** Refuses (413 `request_too_large`) a request whose body is larger than its route allows. */
export function requestBodyLimit(): MiddlewareHandler {
  const limiters = new Map<number, MiddlewareHandler>();
  return (c, next) => {
    const maxSize = bodyLimitOf(c.req.path);
    let limiter = limiters.get(maxSize);
    if (!limiter) limiters.set(maxSize, (limiter = bodyLimit({ maxSize, onError: tooLarge })));
    return limiter(c, next);
  };
}
