import type { Context } from "hono";
import type { Env } from "../../context.js";
import type { Db } from "../../db/index.js";
import { exportStamp } from "../resultsExport.js";

/** Results are reused this long even when the study changed meanwhile: a burst of refreshes runs a query once. */
const REUSE_MS = 10_000;
/** At most this many results kept (per study, view and stamp). */
const MAX_CACHED = 500;

/**
 * The results views are summaries of all answers: heavy. Each response has
 * an ETag from what the study holds (`exportStamp`, a few aggregates): a
 * client asking again with it gets 304 while nothing changed. Computed
 * results are kept per stamp, and reused for a few seconds even after a
 * change, so refreshing repeatedly doesn't repeat the query.
 */
export class ResultsCache {
  private entries = new Map<string, { stamp: string; at: number; value: unknown }>();

  async respond(c: Context<Env>, db: Db, view: string, compute: () => Promise<unknown>): Promise<Response> {
    const studyId = c.get("studyId");
    const key = `${studyId}/${view}`;
    const now = Date.now();
    let entry = this.entries.get(key);
    // Within the reuse time the last result is served as it is (with its own stamp)
    if (!entry || now - entry.at >= REUSE_MS) {
      const stamp = await exportStamp(db, studyId);
      if (!entry || entry.stamp !== stamp) {
        entry = { stamp, at: now, value: await compute() };
        this.entries.delete(key);
        this.entries.set(key, entry);
        if (this.entries.size > MAX_CACHED) this.entries.delete(this.entries.keys().next().value!);
      } else entry.at = now;
    }
    const etag = `"${view.replace(/[^\w-]/g, "_")}-${entry.stamp}"`;
    c.header("ETag", etag);
    c.header("Cache-Control", "private, no-cache");
    // Compression makes the ETag weak (W/"..."): compared without that
    const asked = (c.req.header("if-none-match") ?? "").split(",").map((t) => t.trim().replace(/^W\//, ""));
    if (asked.includes(etag)) return c.body(null, 304);
    return c.json(entry.value);
  }
}
