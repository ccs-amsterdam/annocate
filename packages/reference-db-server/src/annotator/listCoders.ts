import type { Context } from "hono";
import { toAnnotatorCoder, type Store } from "../store.js";

/**
 * `GET /annotator/job/:jobId/coders` (docs/api/annotator.md#listcoders).
 * All coders, with their coder-level values and loop assignments (no emails).
 * The job server only calls this for researcher status, on demand.
 */
export const listCoders = (store: Store) => (c: Context) =>
  c.json(store.coders.map((coder) => toAnnotatorCoder(store, coder)));
