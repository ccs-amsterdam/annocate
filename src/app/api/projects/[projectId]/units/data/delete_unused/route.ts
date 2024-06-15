import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { layouts, units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      await db
        .delete(units)
        .where(
          and(
            eq(units.projectId, params.projectId),
            sql`NOT EXISTS (SELECT 1 FROM ${unitsetUnits} WHERE ${unitsetUnits.unitId} = ${units.id})`,
          ),
        );
    },
    req,
    bodySchema: z.object({}),
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
