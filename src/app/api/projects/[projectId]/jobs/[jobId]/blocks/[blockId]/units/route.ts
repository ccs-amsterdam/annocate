import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import db, { jobBlocks, jobs } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobBlockUnitsResponseSchema } from "../../../../schemas";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: number; jobId: number; blockId: number } },
) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [block] = await db
        .select({ id: jobBlocks.id, jobName: jobs.name, units: jobBlocks.units })
        .from(jobBlocks)
        .leftJoin(jobs, eq(jobs.id, jobBlocks.jobId))
        .where(and(eq(jobs.projectId, projectId), eq(jobBlocks.id, params.blockId)));
      return block;
    },
    req,
    responseSchema: JobBlockUnitsResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
