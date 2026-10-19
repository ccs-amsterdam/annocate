import type { Context } from "hono";
import type { Store } from "../store.js";

/**
 * `GET /annotator/job/:jobId/deployment` (docs/api/annotator.md#getdeployment).
 * Everything the job server needs to run the job, minus unit content: the
 * deployed codebook, the unitsets (plus `__all__`), version and active flag.
 * A real db server builds this from its deployment record and answers 404 if
 * the job isn't deployed (and supports `?preview=1`: the latest codebook).
 */
export const getDeployment = (store: Store) => (c: Context) => c.json(store.spec);
