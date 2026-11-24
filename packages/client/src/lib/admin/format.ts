const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 24 * 60 * 60_000],
  ["hour", 60 * 60_000],
  ["minute", 60_000],
];

/** "3 minutes ago", "yesterday", or a date for anything older than a week; "–" for null. */
export function formatWhen(date: Date | string | null, now = new Date()): string {
  if (date === null) return "–";
  const d = new Date(date);
  const diff = d.getTime() - now.getTime();
  if (-diff > 7 * UNITS[0][1]) return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

/** A link from the server's settings that is safe to open: only `https:` (not `javascript:` or `data:`); else null. */
export function httpsUrl(url: string | null): string | null {
  if (url === null || !URL.canParse(url)) return null;
  return new URL(url).protocol === "https:" ? url : null;
}
