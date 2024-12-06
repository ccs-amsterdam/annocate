import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { projects, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataCreateBodySchema, UnitDataResponseSchema, UnitDataTableParamsSchema } from "./schemas";
import { projectRole } from "@/app/types";
import { reindexUnitPositions } from "./helpers";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: number }> }) {
  const params = await props.params;
  return createTableGet({
    req,
    tableFunction: (email, urlParams) => {
      return db
        .select({
          id: units.unitId,
          data: units.data,
        })
        .from(units)
        .where(eq(units.projectId, params.projectId))
        .groupBy(units.projectId, units.unitId)
        .as("baseQuery");
    },
    paramsSchema: UnitDataTableParamsSchema,
    responseSchema: UnitDataResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    idColumn: "id",
    queryColumns: ["id"],
  });
}

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: number }> }) {
  const params = await props.params;
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        const [{ n }] = await tx
          .select({
            // max: projects.maxUnits,
            n: sql<number>`COUNT(*)`.mapWith(Number),
          })
          .from(units)
          .leftJoin(projects, eq(projects.id, units.projectId))
          .where(eq(units.projectId, params.projectId));

        if (n + body.units.length > 20000) {
          throw new Error("A project can have a maximum of 20,000 units");
        }

        const data = body.units
          .map((unit, i) => {
            return {
              projectId: params.projectId,
              unitId: unit.id,
              data: unit.data,
              position: n + i,
            };
          })
          .filter((unit) => unit.unitId && unit.data);

        let query = tx.insert(units).values(data).$dynamic();

        if (body.overwrite) {
          query = query.onConflictDoUpdate({
            target: [units.projectId, units.unitId],
            set: {
              data: sql`excluded.data`,
            },
          });
        }

        await query;
        await tx.update(projects).set({ unitsUpdated: new Date() }).where(eq(projects.id, params.projectId));

        return { message: "Units created" };
      });
    },
    req,
    bodySchema: UnitDataCreateBodySchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, params) => {
      if (status === 409)
        return `Upload contains units with ids that already exist in this project. Use the overwrite flag to update existing units`;
    },
  });
}
