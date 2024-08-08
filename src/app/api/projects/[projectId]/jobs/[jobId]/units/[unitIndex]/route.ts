import db, { jobUnits, projects, units } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { NextRequest } from "next/server";
import { UnitDataRowSchema } from "../../../../units/schemas";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: number; jobId: number; unitIndex: number } },
) {
  const { projectId, jobId, unitIndex } = params;
  return createGet({
    selectFunction: async (email, params) => {
      const [job] = await db
        .select()
        .from(jobUnits)
        .leftJoin(units, eq(jobUnits.unitId, units.id))
        .where(and(eq(units.projectId, projectId), eq(jobUnits.jobId, jobId), eq(jobUnits.position, unitIndex)));
      return job;
    },
    req,
    responseSchema: UnitDataRowSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
