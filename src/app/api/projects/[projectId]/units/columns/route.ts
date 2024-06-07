import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, inArray, not, SQL, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitColumnsParamSchema, UnitColumnsResponseSchema } from "./schemas";
import { z } from "zod";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createGet({
    req,
    selectFunction: async (email, urlParams) => {
      const where: SQL[] = [eq(units.projectId, params.projectId)];
      where.push(not(eq(units.externalId, "undefined")));
      if (urlParams.unitsets && urlParams.unitsets.length > 0) where.push(inArray(unitsets.name, urlParams.unitsets));

      const columns = await db
        .select({
          column: sql<string>`jsonb_object_keys(${units.data})`.as("columns"),
        })
        .from(units)
        .leftJoin(unitsetUnits, eq(units.id, unitsetUnits.unitId))
        .where(and(...where))
        .groupBy((t) => [t.column]);

      return columns.map((c) => ({
        column: c.column,
      }));
    },
    paramsSchema: UnitColumnsParamSchema,
    responseSchema: z.array(UnitColumnsResponseSchema),
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
