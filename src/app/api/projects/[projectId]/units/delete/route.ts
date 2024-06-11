import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import db, { units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataDeleteBodySchema } from "../schemas";

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      if (body.ids) {
        return db.delete(units).where(and(eq(units.projectId, params.projectId), inArray(units.externalId, body.ids)));
      }

      if (!body.unitsetIds) throw new Error("either ids or unitsetIds  required");
      const idsFromSet = db
        .$with("unitIds")
        .as(db.select({ value: unitsetUnits.unitId }).from(unitsetUnits).where(inArray(unitsets.id, body.unitsetIds)));

      return db
        .with(idsFromSet)
        .delete(units)
        .where(and(eq(units.projectId, params.projectId), inArray(units.id, sql`select * from ${idsFromSet}`)));
    },
    req,
    bodySchema: UnitDataDeleteBodySchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
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
