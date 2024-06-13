import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { layouts, units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { UnitsetsCreateBodySchema, UnitsetsResponseSchema, UnitsetTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createTableGet({
    tableFunction: (email, params) => {
      return db
        .select({
          id: unitsets.id,
          name: unitsets.name,
          layout: sql<string>`${layouts.name}`.as(`layout`),
        })
        .from(unitsets)
        .leftJoin(layouts, eq(unitsets.layoutId, layouts.id))
        .where(eq(unitsets.projectId, projectId))
        .as("baseQuery");
    },
    req,
    paramsSchema: UnitsetTableParamsSchema,
    responseSchema: UnitsetsResponseSchema,
    projectId: params.projectId,
    queryColumns: ["name", "layout"],
    idColumn: "id",
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
          .select({
            id: unitsets.id,
            layoutId: unitsets.layoutId,
            maxPosition: sql<number | null>`max(${unitsetUnits.position})`,
          })
          .from(unitsets)
          .leftJoin(unitsetUnits, eq(unitsets.id, unitsetUnits.unitsetId))
          .where(and(eq(unitsets.projectId, params.projectId), eq(unitsets.name, body.name)))
          .groupBy(unitsets.id);

        const [layout] = body.layout
          ? await tx
              .insert(layouts)
              .values({ projectId: params.projectId, name: body.layout, layout: { fields: [] } })
              .onConflictDoNothing()
              .returning()
          : [undefined];

        if (!unitset) {
          // if unitset does not yet exist, create it
          if (!layout)
            throw new Error(`Unit set "${body.name}" does not exist yet, so a layout must be provided to create it`);

          const [newNnitset] = await tx
            .insert(unitsets)
            .values({ projectId: params.projectId, name: body.name, layoutId: layout.id })
            .returning();
          unitset = { id: newNnitset.id, maxPosition: null, layoutId: layout.id };
        } else {
          // if unitset does exist, and layout is provided, update it
          if (layout && layout.id !== unitset.layoutId) {
            await tx.update(unitsets).set({ layoutId: layout.id }).where(eq(unitsets.id, unitset.id));
          }
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
