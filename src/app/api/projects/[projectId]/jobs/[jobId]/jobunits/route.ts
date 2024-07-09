import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import db, { units, jobs, jobUnits } from "@/drizzle/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { JobUnitsUpdateSchema } from "./schemas";

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
            .leftJoin(jobUnits, eq(units.id, jobUnits.unitId))
            .where(and(inArray(units.externalId, body.unitIds), isNull(jobUnits.jobId)));

          let [job] = await tx
            .select({
              id: jobs.id,
              maxPosition: sql<number | null>`max(${jobUnits.position})`,
            })
            .from(jobs)
            .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, body.id)))
            .groupBy(jobs.id);
          if (!job) throw new Error(`Cannot append. Job "${body.id}" does not exist`);
          maxPosition = job.maxPosition;
        } else {
          // if normal mode (overwrite), first check if this unitset is actually in the project.
          // if so, fetch the unitIds and delete the old unitsetUnits
          const [job] = await tx
            .select({ id: jobs.id })
            .from(jobs)
            .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, body.id)));
          if (!job) throw new Error(`Job "${body.id}" does not exist is is not in project "${params.projectId}"`);
          unitIds = await tx.select({ id: units.id }).from(units).where(inArray(units.externalId, body.unitIds));
          await tx.delete(jobUnits).where(eq(jobUnits.jobId, body.id));
        }

        if (!unitIds) return null;

        await tx
          .insert(jobUnits)
          .values(
            unitIds.map((unitId, i) => ({
              unitId: unitId.id,
              jobId: body.id,
              position: maxPosition == null ? i : maxPosition + i + 1,
            })),
          )
          .onConflictDoNothing();
      });
    },
    req,
    bodySchema: JobUnitsUpdateSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
