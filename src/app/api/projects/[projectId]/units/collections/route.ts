import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import db, { units, unitSets } from "@/drizzle/schema";
import { count, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitCollectionsResponseSchema } from "./schemas";
import { z } from "zod";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      return await db
        .select({
          collection: units.collection,
          count: count(units.id),
        })
        .from(units)
        .where(eq(units.projectId, projectId))
        .groupBy(units.collection);
    },
    req,
    responseSchema: z.array(UnitCollectionsResponseSchema),
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
