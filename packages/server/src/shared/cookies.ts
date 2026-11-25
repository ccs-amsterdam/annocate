import type { Context } from "hono";

/**
 * Whether the request came over https, directly or through a proxy that
 * says so (`x-forwarded-proto`): cookies are then marked `Secure`.
 */
export const isSecure = (c: Context): boolean =>
  new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";
