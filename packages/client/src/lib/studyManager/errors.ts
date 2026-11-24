/** A failure that may go away by itself (no connection, or a server or proxy problem): saving tries again. */
export function isTransient(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch: network error
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && (status >= 500 || status === 408 || status === 429);
}

/** The server refused what was sent (400): sending the same again is refused again. */
export function isRefusal(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 400;
}

/** The server's machine-readable error code (e.g. `codebook_changed`), if any. */
export function errorCodeOf(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

/** An error as the snapshot shows it: its message and code. */
export function errorFields(err: unknown): { error: string; errorCode: string | null } {
  return { error: err instanceof Error ? err.message : String(err), errorCode: errorCodeOf(err) };
}
