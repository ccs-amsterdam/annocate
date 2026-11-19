/** An error that maps directly onto an HTTP response: `{ error, code? }`. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 503,
    message: string,
    /** Machine-readable code the client handles specially (contracts `CoderErrorCode`). */
    readonly code?: string,
  ) {
    super(message);
  }
}

