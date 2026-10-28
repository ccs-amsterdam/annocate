import type { Context } from "hono";
import { z } from "zod";

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

/**
 * The request body, validated with a contracts schema. On failure: the
 * error, to answer with 400 (`c.json({ error }, 400)`).
 */
export async function parseBody<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<{ data: z.output<S>; error?: undefined } | { error: unknown }> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  return parsed.success ? { data: parsed.data } : { error: z.flattenError(parsed.error) };
}
