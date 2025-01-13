import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { NextRequest } from "next/server";
import { JobSetsResponseSchema } from "../../schemas";
import db from "@/drizzle/drizzle";
import { jobs, jobSets, jobSetUnits } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: number; jobId: number }> }) {
  const params = await props.params;
  return createGet({
    selectFunction: async (_email, _urlParams) => {
      return db
        .select({
          id: jobSets.id,
          name: jobSets.name,
          unitIds: sql<number[] | null>`ARRAY_AGG(${jobSetUnits.unitId})`.as("unitIds"),
        })
        .from(jobSets)
        .leftJoin(jobSetUnits, eq(jobSetUnits.jobSetId, jobSets.id))
        .leftJoin(jobs, eq(jobs.id, jobSets.jobId))
        .where(and(eq(jobs.projectId, params.projectId), eq(jobSets.jobId, params.jobId)))
        .groupBy(jobSets.id);
    },
    req,
    projectId: params.projectId,
    responseSchema: JobSetsResponseSchema,
    authorizeFunction: async (auth, _params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
