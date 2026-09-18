import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { jobs, projects, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataCreateBodySchema, UnitDataResponseSchema, UnitDataTableParamsSchema } from "./schemas";
import { safeParams } from "@/functions/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);
  return createTableGet({
    req,
    tableFunction: (email, urlParams) => {
      return (
        db
          .select({
            id: units.id,
            externalId: units.externalId,
            data: units.data,
          })
          .from(units)
          .where(eq(units.jobId, params.jobId))
          // .groupBy(units.projectId, units.unitId, units.data)
          .as("baseQuery")
      );
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

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        const [{ n }] = await tx
          .select({
            // max: projects.maxUnits,
            n: sql<number>`COUNT(*)`.mapWith(Number),
          })
          .from(units)
          .leftJoin(jobs, eq(jobs.id, units.jobId))
          .where(eq(units.jobId, params.jobId));

        if (n + body.units.length > 20000) {
          throw new Error("A project can have a maximum of 20,000 units");
        }

        const data = body.units
          .map((unit, i) => {
            return {
              jobId: params.jobId,
              externalId: unit.id,
              data: unit.data,
              position: n + i,
            };
          })
          .filter((unit) => unit.externalId && unit.data);

        let query = tx.insert(units).values(data).$dynamic();

        if (body.overwrite) {
          query = query.onConflictDoUpdate({
            target: [units.jobId, units.externalId],
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
