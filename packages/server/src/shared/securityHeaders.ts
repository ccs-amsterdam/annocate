import type { MiddlewareHandler } from "hono";
import { RESIZE_SCRIPT_HASH } from "@annotinder/contracts";

// HTTP security headers (docs/security.md "Headers"). Every response gets
// the cheap ones; pages (HTML) also get a Content Security Policy.

export interface SecurityHeaderOptions {
  /** Origins that may show AnnoTinder in a frame, besides itself (e.g. AmCAT's). */
  frameAncestors?: string[];
  /** The server is reached over HTTPS: tell browsers to stay on it (HSTS). */
  https?: boolean;
}

/** The pages' policy: everything from this origin, plus what the app needs (see docs/security.md). */
export function contentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  return [
    "default-src 'self'",
    // QuickJS (conditions and expressions) runs as WebAssembly; the ::html
    // frame's height script is allowed by its hash (frames inherit this policy).
    `script-src 'self' 'wasm-unsafe-eval' '${RESIZE_SCRIPT_HASH}'`,
    // React and the code editor set styles inline; layouts' style blocks too.
    "style-src 'self' 'unsafe-inline'",
    // Units may show images and media from the web (https only).
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // The code editor's workers.
    "worker-src 'self' blob:",
    "frame-src 'self'",
    `frame-ancestors 'self'${(options.frameAncestors ?? []).map((o) => ` ${o}`).join("")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions = {}): MiddlewareHandler {
  const csp = contentSecurityPolicy(options);
  return async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set("X-Content-Type-Options", "nosniff");
    // Invite links carry their secret in the URL: other sites get only the origin.
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    if (options.https) h.set("Strict-Transport-Security", "max-age=31536000");
    if ((h.get("content-type") ?? "").startsWith("text/html")) {
      h.set("Content-Security-Policy", csp);
      // Older browsers, without frame-ancestors (only when no other origin may frame it).
      if (!options.frameAncestors?.length) h.set("X-Frame-Options", "SAMEORIGIN");
    }
  };
}
