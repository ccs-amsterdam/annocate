import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { units } from "@/drizzle/schema";
import { and, eq, inArray, SQL, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataCreateBodySchema, UnitDataResponseSchema, UnitDataTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    tableFunction: (email, urlParams) => {
      const where: SQL[] = [eq(units.projectId, params.projectId)];
      if (urlParams.collections) where.push(inArray(units.collection, urlParams.collections));

      return db
        .select({
          id: units.externalId,
          collection: units.collection,
          data: units.data,
        })
        .from(units)
        .where(and(...where))
        .as("baseQuery");
    },
    paramsSchema: UnitDataTableParamsSchema,
    responseSchema: UnitDataResponseSchema,
    idColumn: "id",
    queryColumns: ["collection", "id"],
  });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const data = body.units.map((unit) => ({
        projectId: params.projectId,
        externalId: unit.id,
        collection: unit.collection,
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
              collection: sql`excluded.collection`,
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
