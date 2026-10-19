import { Hono } from "hono";
import type { JobTokenIssuer } from "./jobTokens.js";
import type { Store } from "./store.js";
import { requestJobToken } from "./annotator/requestJobToken.js";
import { requireJobToken } from "./annotator/requireJobToken.js";
import { getDeployment } from "./annotator/getDeployment.js";
import { getUnits } from "./annotator/getUnits.js";
import { listCoders } from "./annotator/listCoders.js";
import { resolveCoder } from "./annotator/resolveCoder.js";
import { putCoder } from "./annotator/putCoder.js";
import { listFinished } from "./annotator/listFinished.js";
import { listAnnotations } from "./annotator/listAnnotations.js";
import { putAnnotations } from "./annotator/putAnnotations.js";

export { loadFixture, type Store } from "./store.js";

/**
 * The reference db server: the annotator API (contracts `annotatorEndpoints`,
 * docs/api/annotator.md) and nothing else, in memory, for one job loaded
 * from a fixture. One file per endpoint in ./annotator, named after its key
 * in `annotatorEndpoints`. A real db server also implements the researcher
 * API, and stores everything; see README.md. Checked by packages/conformance.
 */
export function createServer(store: Store, tokens: JobTokenIssuer) {
  const api = new Hono();

  // How a job server gets authenticated: before the job token check
  api.post("/token", requestJobToken(store, tokens));
  api.use("*", requireJobToken(store, tokens));

  api.get("/deployment", getDeployment(store));
  api.get("/units", getUnits(store));
  api.get("/coders", listCoders(store));
  api.post("/coders/resolve", resolveCoder(store));
  api.put("/coders/:coderId", putCoder(store));
  api.post("/finished", listFinished(store));
  api.get("/annotations", listAnnotations(store));
  api.post("/annotations", putAnnotations(store));

  return new Hono().route("/annotator/job/:jobId", api);
}
