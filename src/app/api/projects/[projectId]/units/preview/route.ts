import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, safeParams } from "@/app/api/routeHelpers";
import { jobBlocks, jobBlockSets, jobs, jobSetUnits, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataRowSchema } from "../schemas";
import { PreviewUnitParamsSchema } from "./schemas";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = safeParams(await props.params);
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      const i = Number(urlParams.position - 1);

      const [unit] = await db
        .select({
          id: units.externalId,
          data: units.data,
        })
        .from(jobBlocks)
        .leftJoin(jobBlockSets, eq(jobBlockSets.jobBlockId, jobBlocks.id))
        .leftJoin(jobs, eq(jobs.id, jobBlocks.jobId))
        .leftJoin(jobSetUnits, eq(jobSetUnits.jobSetId, jobBlockSets.jobSetId))
        .leftJoin(units, eq(units.id, jobSetUnits.unitId))
        .where(
          and(
            eq(jobs.projectId, projectId),
            eq(jobBlockSets.jobSetId, urlParams.jobSetId),
            eq(jobSetUnits.position, i),
          ),
        );
      return unit;
    },
    req,
    paramsSchema: PreviewUnitParamsSchema,
    responseSchema: UnitDataRowSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

function rawInt(i: number) {
  const safeI = String(Number(i));
  return sql.raw(safeI);
}
