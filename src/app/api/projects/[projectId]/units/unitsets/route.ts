import { hasMinProjectRole } from "@/app/api/authorization";
import { createDelete, createGet, createUpdate } from "@/app/api/routeHelpers";
import db, { units, layouts, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitsetsCreateBodySchema, UnitsetsResponseSchema } from "./schemas";
import { z } from "zod";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      return await db
        .select({
          id: unitsets.id,
          name: unitsets.name,
          count: count(unitsetUnits.unitId),
        })
        .from(unitsets)
        .leftJoin(unitsetUnits, eq(unitsets.id, unitsetUnits.unitsetId))
        .where(eq(unitsets.projectId, projectId))
        .groupBy(unitsets.id);
    },
    req,
    responseSchema: z.array(UnitsetsResponseSchema),
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        const unitIds = await tx.select({ id: units.id }).from(units).where(inArray(units.externalId, body.unitIds));

        let [unitset] = await tx
          .select({ id: unitsets.id, maxPosition: sql<number | null>`max(${unitsetUnits.position})` })
          .from(unitsets)
          .leftJoin(unitsetUnits, eq(unitsets.id, unitsetUnits.unitsetId))
          .where(and(eq(unitsets.projectId, params.projectId), eq(unitsets.name, body.name)))
          .groupBy(unitsets.id);

        if (!unitset) {
          const [newNnitset] = await tx
            .insert(unitsets)
            .values({ projectId: params.projectId, name: body.name })
            .returning();
          unitset = { id: newNnitset.id, maxPosition: null };
        }

        if (body.method === "replace") {
          await tx.delete(unitsetUnits).where(eq(unitsetUnits.unitsetId, unitset.id));
          unitset.maxPosition = null;
        }

        await tx
          .insert(unitsetUnits)
          .values(
            unitIds.map((unitId, i) => ({
              unitId: unitId.id,
              unitsetId: unitset.id,
              position: unitset.maxPosition == null ? i : unitset.maxPosition + i + 1,
            })),
          )
          .onConflictDoNothing();

        if (body.method === "replace" || body.method === "delete") {
          // delete any orphaned units
          await tx
            .delete(units)
            .where(
              and(
                eq(units.projectId, params.projectId),
                sql`NOT EXISTS (SELECT 1 FROM ${unitsetUnits} WHERE ${unitsetUnits.unitId} = ${units.id})`,
              ),
            );
        }
      });
    },
    req,
    bodySchema: UnitsetsCreateBodySchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

// export async function DELETE(req: Request, { params }: { params: { projectId: number; unitsetId: number } }) {
//   return createDelete({
//     deleteFunction: async (email, body) => {
//       await db.delete(unitsets).where(eq(unitsets.id, params.unitsetId));
//     },
//     req,
//     authorizeFunction: async (auth, body) => {
//       if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
//     },
//   });
// }
