import db, { jobBlocks, projects, units } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { NextRequest } from "next/server";
import { AnnotateUnitSchema } from "@/app/api/annotate/schemas";
import { PreviewUnitsParamsSchema, PreviewUnitsResponseSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      let unitIds: string[] = [];

      if (urlParams.blockId) {
        const [blockUnits] = await db
          .select({ units: jobBlocks.units })
          .from(jobBlocks)
          .where(and(eq(jobBlocks.projectId, projectId), eq(jobBlocks.id, urlParams.blockId)))

          .limit(100);
        if (blockUnits?.units) unitIds = blockUnits.units;
      }

      if (unitIds.length === 0) {
        const unitList = await db
          .select({ id: units.unitId })
          .from(units)
          .where(eq(units.projectId, projectId))
          .limit(100);
        unitIds = unitList.map((unit) => unit.id);
      }

      return unitIds;
    },
    req,
    paramsSchema: PreviewUnitsParamsSchema,
    responseSchema: PreviewUnitsResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
