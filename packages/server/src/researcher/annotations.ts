import { Hono } from "hono";
import {
  AnnotationsQuerySchema,
  UnitVersionsQuerySchema,
  type AnnotationRow,
  type UnitVersion,
} from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { annotationValues as a, coderDevices, coders, units, unitServes, unitVersions } from "../db/schema/index.js";
import { unitDataHash, unitVersionData } from "../db/sql.js";
import { requireStudyUser } from "./auth.js";

/**
 * Annotations, one row per unit, coder and variable, a page at a time in
 * the order they were written (contracts annotations.ts). The cursor is the
 * row id, so a page never changes once read, also while coders keep coding.
 */
export function annotations(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/annotations", requireStudyUser(server, "READ"), async (c) => {
    const parsed = AnnotationsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { after, limit, retired } = parsed.data;
    const rows = await db
      .select({
        id: a.id,
        unitId: a.unitId,
        externalId: units.externalId,
        coderId: a.coderId,
        participantId: coders.participantId,
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
      .leftJoin(coders, eq(coders.id, a.coderId))
      .leftJoin(unitServes, and(eq(unitServes.coderId, a.coderId), eq(unitServes.unitId, a.unitId)))
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
          id: coderDevices.id,
          coderId: coderDevices.coderId,
          type: coderDevices.deviceType,
          browser: coderDevices.browser,
          os: coderDevices.os,
          created: coderDevices.created,
        })
        .from(coderDevices)
        .where(eq(coderDevices.studyId, c.get("studyId")))
        .orderBy(asc(coderDevices.id)),
    ),
  );

  // Unit versions (contracts UnitVersionSchema), oldest first: every answer
  // points to the version deployed when it was given (docs/architecture.md §8.4).
  app.get("/study/:studyId/unit-versions", requireStudyUser(server, "READ"), async (c) => {
    const parsed = UnitVersionsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { after, limit } = parsed.data;
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
