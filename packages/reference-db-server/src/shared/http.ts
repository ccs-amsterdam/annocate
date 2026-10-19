import type { Context } from "hono";
import { z } from "zod";

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
