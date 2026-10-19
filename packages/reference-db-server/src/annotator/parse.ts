import type { Context } from "hono";

/** The request body validated with a contracts schema, or null if it's missing or invalid (answer 400). */
export async function parseBody<T>(
  c: Context,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): Promise<T | null> {
  try {
    const parsed = schema.safeParse(await c.req.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
