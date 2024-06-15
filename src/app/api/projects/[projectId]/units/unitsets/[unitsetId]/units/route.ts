import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import db, { units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { UnitsetUnitsUpdateSchema } from "../../schemas";

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        let maxPosition: null | number = null;
        let unitIds: { id: number }[] | undefined;

        // todo: can save one query by returning the unitids within the unitset call (concatenate them)

        if (body.append) {
          // if append mode, get the unit ids (for the given external ids), and also
          // ignore the ones that are already in the unitset. Also get the max position
          // to use as offset
          unitIds = await tx
            .select({ id: units.id })
            .from(units)
            .leftJoin(unitsetUnits, eq(units.id, unitsetUnits.unitId))
            .where(and(inArray(units.externalId, body.unitIds), isNull(unitsetUnits.unitsetId)));

          let [unitset] = await tx
            .select({
              id: unitsets.id,
              maxPosition: sql<number | null>`max(${unitsetUnits.position})`,
            })
            .from(unitsets)
            .where(and(eq(unitsets.projectId, params.projectId), eq(unitsets.id, body.id)))
            .groupBy(unitsets.id);
          if (!unitset) throw new Error(`Cannot appendUnit set "${body.id}" does not exist`);
          maxPosition = unitset.maxPosition;
        } else {
          // if normal mode (overwrite), first check if this unitset is actually in the project.
          // if so, fetch the unitIds and delete the old unitsetUnits
          const [unitset] = await tx
            .select({ id: unitsets.id })
            .from(unitsets)
            .where(and(eq(unitsets.projectId, params.projectId), eq(unitsets.id, body.id)));
          if (!unitset)
            throw new Error(`Unit set "${body.id}" does not exist is is not in project "${params.projectId}"`);
          unitIds = await tx.select({ id: units.id }).from(units).where(inArray(units.externalId, body.unitIds));
          await tx.delete(unitsetUnits).where(eq(unitsetUnits.unitsetId, body.id));
        }

        await tx
          .insert(unitsetUnits)
          .values(
            unitIds.map((unitId, i) => ({
              unitId: unitId.id,
              unitsetId: body.id,
              position: maxPosition == null ? i : maxPosition + i + 1,
            })),
          )
          .onConflictDoNothing();
      });
    },
    req,
    bodySchema: UnitsetUnitsUpdateSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
