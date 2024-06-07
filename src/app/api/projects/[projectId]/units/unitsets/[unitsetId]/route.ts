import db, { projects, units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { UnitsetResponseSchema } from "../schemas";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; unitsetId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [unitset] = await db
        .select({
          id: unitsets.id,
          name: unitsets.name,
          units: sql`array_agg(${units.externalId})`.as("units"),
        })
        .from(unitsetUnits)
        .leftJoin(units, eq(unitsetUnits.unitId, units.id))
        .leftJoin(unitsets, eq(unitsetUnits.unitsetId, unitsets.id))
        .where(and(eq(projects.id, projectId), eq(unitsetUnits.unitsetId, params.unitsetId)));
      return unitset;
    },
    req,
    responseSchema: UnitsetResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
