import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { HttpError } from "../shared/http.js";
import { fileToken, LINK_SECONDS } from "../shared/files.js";
import { ensureResultsExport } from "../shared/resultsExport.js";
import { agreement } from "../shared/results/agreement.js";
import { answerCounts } from "../shared/results/answerCounts.js";
import { resultCoders } from "../shared/results/resultCoders.js";
import { resultUnit, resultUnits } from "../shared/results/resultUnits.js";
import { ResultsCache } from "../shared/results/resultsCache.js";
import { requireStudyUser } from "./auth.js";
import { idParam } from "../shared/request.js";

// The researcher's look at the answers so far (contracts results.ts): counts
// per question, agreement per unit-loop question, the units coders disagree
// on, and the coders. Live answers only, under the deployed design's
// questions (shared/results/).

export function results(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  const cache = new ResultsCache();
  const { db } = server;
  app.get("/study/:studyId/results/answers", requireStudyUser(server, "READ"), (c) =>
    cache.respond(c, db, "answers", async () => ({ questions: await answerCounts(db, c.get("studyId")) })),
  );
  app.get("/study/:studyId/results/agreement", requireStudyUser(server, "READ"), (c) =>
    cache.respond(c, db, "agreement", async () => ({ questions: await agreement(db, c.get("studyId")) })),
  );
  app.get("/study/:studyId/results/units", requireStudyUser(server, "READ"), (c) =>
    cache.respond(c, db, "units", async () => ({ units: await resultUnits(db, c.get("studyId")) })),
  );
  app.get("/study/:studyId/results/units/:unitId", requireStudyUser(server, "READ"), async (c) => {
    const unitId = idParam(c, "unitId");
    return cache.respond(c, db, `unit-${unitId}`, async () => {
      const found = await resultUnit(db, c.get("studyId"), unitId);
      if (!found) throw new HttpError(404, "Unit not found");
      return found;
    });
  });
  // The raw export (shared/resultsExport.ts): written or reused, then a download link
  app.post("/study/:studyId/results/export", requireStudyUser(server, "READ"), async (c) => {
    const { key, size, filename } = await ensureResultsExport(server.db, server.files, c.get("studyId"));
    const expires = Date.now() + LINK_SECONDS * 1000;
    return c.json({
      url: `/api/files/${fileToken(server.secret, key, filename, expires)}`,
      expires: new Date(expires),
      size,
    });
  });
  app.get("/study/:studyId/results/coders", requireStudyUser(server, "READ"), (c) =>
    cache.respond(c, db, "coders", async () => ({ coders: await resultCoders(db, c.get("studyId")) })),
  );
  return app;
}
