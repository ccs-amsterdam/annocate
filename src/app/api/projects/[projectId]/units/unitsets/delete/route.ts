import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import db, { units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitsetDeleteBodySchema } from "../schemas";

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      db.transaction(async (tx) => {
        await tx.delete(unitsets).where(and(eq(unitsets.projectId, params.projectId), inArray(unitsets.id, body.ids)));

        // delete any orphaned units
        await tx
          .delete(units)
          .where(
            and(
              eq(units.projectId, params.projectId),
              sql`NOT EXISTS (SELECT 1 FROM ${unitsetUnits} WHERE ${unitsetUnits.unitId} = ${units.id})`,
            ),
          );
      });
    },
    req,
    bodySchema: UnitsetDeleteBodySchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
