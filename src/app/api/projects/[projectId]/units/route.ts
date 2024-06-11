import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, not, SQL, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataCreateBodySchema, UnitDataResponseSchema, UnitDataTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    tableFunction: (email, urlParams) => {
      const where: SQL[] = [eq(units.projectId, params.projectId)];
      where.push(not(eq(units.externalId, "undefined")));
      if (urlParams.unitset) where.push(eq(unitsets.name, urlParams.unitset));

      return db
        .select({
          id: units.externalId,
          unitsets: sql`array_agg(${unitsets.name})`.as("unitsets"),
          data: units.data,
        })
        .from(units)
        .innerJoin(unitsetUnits, eq(units.id, unitsetUnits.unitId))
        .innerJoin(unitsets, eq(unitsetUnits.unitsetId, unitsets.id))
        .where(and(...where))
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
          .select({ id: unitsets.id })
          .from(unitsets)
          .where(and(eq(unitsets.projectId, params.projectId), eq(unitsets.name, body.unitset)));

        if (!unitset) {
          [unitset] = await tx.insert(unitsets).values({ projectId: params.projectId, name: body.unitset }).returning();
        }

        await tx
          .insert(unitsetUnits)
          .values(
            newUnits.map((unit) => ({
              unitId: unit.id,
              unitsetId: unitset.id,
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
