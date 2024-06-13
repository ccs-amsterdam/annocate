import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { layouts, units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, not, SQL, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataCreateBodySchema, UnitDataResponseSchema, UnitDataTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    tableFunction: (email, urlParams) => {
      return db
        .select({
          id: units.externalId,
          data: units.data,
        })
        .from(units)
        .where(eq(units.projectId, params.projectId))
        .groupBy(units.id)
        .as("baseQuery");
    },
    paramsSchema: UnitDataTableParamsSchema,
    responseSchema: UnitDataResponseSchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    idColumn: "id",
    queryColumns: ["id"],
  });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        const data = body.units
          .map((unit) => ({
            projectId: params.projectId,
            externalId: unit.id,
            data: unit.data,
          }))
          .filter((unit) => unit.externalId && unit.data);

        let query = tx.insert(units).values(data).$dynamic();

        if (body.overwrite) {
          query = query.onConflictDoUpdate({
            target: [units.projectId, units.externalId],
            set: {
              data: sql`excluded.data`,
            },
          });
        }
        const newUnits = await query.returning();

        let [unitset] = await tx
          .select({
            id: unitsets.id,
            layoutId: unitsets.layoutId,
            maxPosition: sql<number | null>`max(${unitsetUnits.position})`,
          })
          .from(unitsets)
          .leftJoin(unitsetUnits, eq(unitsets.id, unitsetUnits.unitsetId))
          .where(and(eq(unitsets.projectId, params.projectId), eq(unitsets.name, body.unitset)))
          .groupBy(unitsets.id);

        const [layout] = body.layout
          ? await tx
              .insert(layouts)
              .values({ projectId: params.projectId, name: body.layout, layout: { fields: [] } })
              .onConflictDoNothing()
              .returning()
          : [undefined];

        if (!unitset) {
          // if unitset does not yet exist, we create it
          if (!layout)
            throw new Error(`Unit set "${body.unitset}" does not exist yet, so a layout must be provided to create it`);

          const [newNnitset] = await tx
            .insert(unitsets)
            .values({ projectId: params.projectId, name: body.unitset, layoutId: layout.id })
            .returning();

          unitset = { id: newNnitset.id, maxPosition: null, layoutId: layout.id };
        } else {
          // if unitset does exist, and layout is provided, we update it
          if (layout && layout.id !== unitset.layoutId)
            await tx.update(unitsets).set({ layoutId: layout.id }).where(eq(unitsets.id, unitset.id));
        }

        await tx
          .insert(unitsetUnits)
          .values(
            newUnits.map((unit, i) => ({
              unitId: unit.id,
              unitsetId: unitset.id,
              position: unitset.maxPosition == null ? i : unitset.maxPosition + i + 1,
            })),
          )
          .onConflictDoNothing();

        return null;
      });
    },
    req,
    bodySchema: UnitDataCreateBodySchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, params) => {
      if (status === 409)
        return `Upload contains units with ids that already exist in this project. Use the overwrite flag to update existing units`;
    },
  });
}

// function setUnitsetPositions(db: any, unitsetId: number) {
//   return db
//     .select({ id: unitsetUnits.id })
//     .from(unitsetUnits)
//     .where(eq(unitsetUnits.unitsetId, unitsetId))
//     .orderBy(unitsetUnits.id)
//     .as("unitsetUnits");
// }
