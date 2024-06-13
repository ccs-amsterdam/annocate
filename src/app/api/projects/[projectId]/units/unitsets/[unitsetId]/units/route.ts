import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import db, { units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { UnitsetUnitsUpdateSchema } from "../../schemas";

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        const unitIds = await tx.select({ id: units.id }).from(units).where(inArray(units.externalId, body.unitIds));

        let [unitset] = await tx
          .select({
            id: unitsets.id,
            maxPosition: sql<number | null>`max(${unitsetUnits.position})`,
          })
          .from(unitsets)
          .where(and(eq(unitsets.projectId, params.projectId), eq(unitsets.id, body.id)))
          .groupBy(unitsets.id);

        if (!unitset) throw new Error(`Unit set "${body.id}" does not exist`);

        if (body.method === "replace") {
          await tx.delete(unitsetUnits).where(eq(unitsetUnits.unitsetId, unitset.id));
          unitset.maxPosition = null;
        }

        await tx
          .insert(unitsetUnits)
          .values(
            unitIds.map((unitId, i) => ({
              unitId: unitId.id,
              unitsetId: unitset.id,
              position: unitset.maxPosition == null ? i : unitset.maxPosition + i + 1,
            })),
          )
          .onConflictDoNothing();

        if (body.method === "replace" || body.method === "delete") {
          // delete any orphaned units
          await tx
            .delete(units)
            .where(
              and(
                eq(units.projectId, params.projectId),
                sql`NOT EXISTS (SELECT 1 FROM ${unitsetUnits} WHERE ${unitsetUnits.unitId} = ${units.id})`,
              ),
            );
        }
      });
    },
    req,
    bodySchema: UnitsetUnitsUpdateSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
