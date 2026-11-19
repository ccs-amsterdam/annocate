import { Hono } from "hono";
import { ResetAnnotationsSchema, type ResetAnnotations } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireSensitive, requireStudyUser } from "./auth.js";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { anyOf } from "../db/sql.js";
import { annotationValues as a, deployments } from "../db/schema/index.js";

// Reset: retire the live values of these variables (e.g. a loop's
// questions), so the units are coded again. Nothing is deleted.
export function annotationsReset(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.post(
    "/study/:studyId/annotations/reset",
    requireStudyUser(server, "ADMIN"),
    requireSensitive(server),
    async (c) => {
      const parsed = ResetAnnotationsSchema.safeParse(await c.req.json());
      if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
      const studyId = c.get("studyId");
      const retired = await db.transaction((tx) => retireAnnotations(tx, studyId, parsed.data));
      await server.deployments.refresh(studyId);
      return c.json({ retired });
    },
  );

  return app;
}

async function retireAnnotations(db: Db, studyId: number, request: ResetAnnotations): Promise<number> {
  const retired = await db
    .update(a)
    .set({ retiredAt: sql`now()` })
    .where(
      and(
        eq(a.studyId, studyId),
        isNotNull(a.unitId),
        isNull(a.retiredAt),
        inArray(a.variable, request.variables),
        // None given: all
        request.unitIds?.length ? anyOf(a.unitId, request.unitIds) : undefined,
        request.coderIds?.length ? anyOf(a.coderId, request.coderIds) : undefined,
      ),
    )
    .returning({ id: a.id });
  await db
    .update(deployments)
    .set({ annotationEpoch: sql`${deployments.annotationEpoch} + 1` })
    .where(eq(deployments.studyId, studyId));
  return retired.length;
}
