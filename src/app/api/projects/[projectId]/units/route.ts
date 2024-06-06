import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, inArray, SQL, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataCreateBodySchema, UnitDataResponseSchema, UnitDataTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    tableFunction: (email, urlParams) => {
      const where: SQL[] = [eq(units.projectId, params.projectId)];
      if (urlParams.unitsets) where.push(inArray(unitsets.name, urlParams.unitsets));

      return db
        .select({
          id: units.externalId,
          unitsets: sql`array_agg(${unitsets.name})`.as("unitsets"),
          data: units.data,
        })
        .from(units)
        .leftJoin(unitsetUnits, eq(units.id, unitsetUnits.unitId))
        .leftJoin(unitsets, eq(unitsetUnits.unitsetId, unitsets.id))
        .where(and(...where))
        .groupBy(units.id)
        .as("baseQuery");
    },
    paramsSchema: UnitDataTableParamsSchema,
    responseSchema: UnitDataResponseSchema,
    idColumn: "id",
    queryColumns: ["id"],
  });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const data = body.units.map((unit) => ({
        projectId: params.projectId,
        externalId: unit.id,
        data: unit.data,
      }));

      if (body.overwrite) {
        await db
          .insert(units)
          .values(data)
          .onConflictDoUpdate({
            target: [units.projectId, units.externalId],
            set: {
              data: sql`excluded.data`,
            },
          });
      } else {
        await db.insert(units).values(data);
      }
      return null;
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
