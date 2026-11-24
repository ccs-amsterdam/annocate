/**
 * An ending's redirect as the browser may follow it: an absolute http(s) URL,
 * or null. The URL comes from a study setting with values filled in, so any
 * other scheme (`javascript:`, `data:`) is not followed or linked.
 */
export function webRedirect(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
