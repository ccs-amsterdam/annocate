import { Hono } from "hono";
import {
  AnnotationsQuerySchema,
  UnitVersionsQuerySchema,
  type AnnotationRow,
  type UnitVersion,
} from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import {
  annotationValues as a,
  sessionDevices,
  coderSessions,
  units,
  unitServes,
  unitVersions,
} from "../db/schema/index.js";
import { unitDataHash, unitVersionData } from "../db/sql.js";
import { requireStudyUser } from "./auth.js";
import { parseQuery } from "../shared/request.js";

/**
 * Annotations, one row per unit, coder and variable, a page at a time in
 * the order they were written (contracts annotations.ts). The cursor is the
 * row id, so a page never changes once read, also while coders keep coding.
 */
export function annotations(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/annotations", requireStudyUser(server, "READ"), async (c) => {
    const { after, limit, retired } = parseQuery(c, AnnotationsQuerySchema);
    const rows = await db
      .select({
        id: a.id,
        unitId: a.unitId,
        externalId: units.externalId,
        sessionId: a.sessionId,
        coder: coderSessions.coder,
        variable: a.variable,
        value: a.value,
        designVersionId: a.designVersionId,
        unitVersionId: a.unitVersionId,
        deviceId: a.deviceId,
        assigned: a.assigned,
        timing: a.timing,
        servedAt: unitServes.firstServed,
        created: a.created,
        updated: a.updated,
        retiredAt: a.retiredAt,
      })
      .from(a)
      .leftJoin(units, eq(units.id, a.unitId))
      .leftJoin(coderSessions, eq(coderSessions.id, a.sessionId))
      .leftJoin(unitServes, and(eq(unitServes.sessionId, a.sessionId), eq(unitServes.unitId, a.unitId)))
      .where(and(eq(a.studyId, c.get("studyId")), gt(a.id, after ?? 0), retired ? undefined : isNull(a.retiredAt)))
      .orderBy(asc(a.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit).map((row) => {
      const out: AnnotationRow = { ...row } as AnnotationRow;
      if (!retired) delete out.retiredAt;
      return out;
    });
    return c.json({ annotations: page, next: rows.length > limit ? page[page.length - 1].id : null });
  });

  app.get("/study/:studyId/devices", requireStudyUser(server, "READ"), async (c) =>
    c.json(
      await db
        .select({
          id: sessionDevices.id,
          sessionId: sessionDevices.sessionId,
          type: sessionDevices.deviceType,
          browser: sessionDevices.browser,
          os: sessionDevices.os,
          created: sessionDevices.created,
        })
        .from(sessionDevices)
        .where(eq(sessionDevices.studyId, c.get("studyId")))
        .orderBy(asc(sessionDevices.id)),
    ),
  );

  // Unit versions (contracts UnitVersionSchema), oldest first: every answer
  // points to the version deployed when it was given (docs/architecture.md §8.4).
  app.get("/study/:studyId/unit-versions", requireStudyUser(server, "READ"), async (c) => {
    const { after, limit } = parseQuery(c, UnitVersionsQuerySchema);
    const versions = db
      .select({
        id: unitVersions.id,
        unitId: unitVersions.unitId,
        externalId: units.externalId,
        data: unitVersionData(unitVersions.id).as("data"),
        created: unitVersions.created,
      })
      .from(unitVersions)
      .innerJoin(units, eq(units.id, unitVersions.unitId))
      .where(and(eq(unitVersions.studyId, c.get("studyId")), gt(unitVersions.id, after ?? 0)))
      .orderBy(asc(unitVersions.id))
      .limit(limit + 1)
      .as("v");
    const rows: UnitVersion[] = await db
      .select({
        id: versions.id,
        unitId: versions.unitId,
        externalId: versions.externalId,
        hash: unitDataHash(versions.data),
        data: versions.data,
        created: versions.created,
      })
      .from(versions)
      .orderBy(asc(versions.id));
    const page = rows.slice(0, limit);
    return c.json({ versions: page, next: rows.length > limit ? page[page.length - 1].id : null });
  });

  return app;
}
