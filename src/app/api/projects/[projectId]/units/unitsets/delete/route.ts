import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import db, { units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitsetDeleteBodySchema } from "../schemas";

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      db.transaction(async (tx) => {
        await tx.delete(unitsets).where(and(eq(unitsets.projectId, params.projectId), inArray(unitsets.id, body.ids)));

        // remove any orphaned units
        const activeUnits = await tx
          .selectDistinct({ id: units.id })
          .from(units)
          .leftJoin(unitsetUnits, eq(units.id, unitsetUnits.unitId))
          .where(isNull(unitsetUnits.unitsetId));

        await tx.delete(units).where(
          inArray(
            units.id,
            activeUnits.map((u) => u.id),
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
