import { DrizzleQueryError } from "drizzle-orm/errors";

/** What a schema refused in a request: where (a path with dots, "" for the whole) and why. */
export interface RequestIssue {
  path: string;
  message: string;
}

/**
 * An error that maps directly onto an HTTP response, in the API's one error
 * shape: `{ error: string, code?, issues? }` (`issues`: what a schema
 * refused in the request, shared/request.ts).
 */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 503,
    message: string,
    /** Machine-readable code the client handles specially (contracts `CoderErrorCode`). */
    readonly code?: string,
    readonly issues?: RequestIssue[],
  ) {
    super(message);
  }
}

/**
 * The Postgres error code (SQLSTATE) behind an error, if a query failed. The
 * driver's error is the `cause` of the error drizzle throws.
 */
export function postgresCode(err: unknown): string | undefined {
  for (const error of causes(err)) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

/**
 * What the log says of an unexpected error: of a failed query its text and
 * the database's message, never its parameters (answers, emails, key hashes).
 * The driver's error itself is not logged either: it carries the parameters
 * and, in `detail`, values of the row.
 */
export function logLines(err: unknown): string[] {
  const errors = causes(err);
  const failed = errors.find((error) => error instanceof DrizzleQueryError);
  if (!failed) return [stackOf(err)];
  return [`Failed query: ${failed.query}`, `${postgresCode(failed.cause) ?? ""} ${failed.cause?.message ?? ""}`.trim()];
}

/** An error and the errors that caused it, outermost first. */
function causes(err: unknown): unknown[] {
  const chain: unknown[] = [];
  let error = err;
  while (error instanceof Error && !chain.includes(error)) {
    chain.push(error);
    error = error.cause;
  }
  return chain;
}

const stackOf = (err: unknown) => (err instanceof Error ? (err.stack ?? err.message) : String(err));
