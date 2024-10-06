import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { jobBlocks, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataRowSchema } from "../schemas";
import { PreviewUnitParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      const i = Number(urlParams.position - 1);

      if (urlParams.blockId !== undefined) {
        const sq = db
          .select({
            projectId: jobBlocks.projectId,
            getId: sql`${jobBlocks.units}->>${rawInt(i)}`.as("getId"),
          })
          .from(jobBlocks)
          .where(and(eq(jobBlocks.projectId, projectId), eq(jobBlocks.id, urlParams.blockId)))
          .as("sq");

        const [unit] = await db
          .select({
            id: units.unitId,
            data: units.data,
          })
          .from(units)
          .innerJoin(sq, and(eq(units.projectId, sq.projectId), eq(units.unitId, sq.getId)));

        return unit;
      }

      const [unit] = await db
        .select({
          id: units.unitId,
          data: units.data,
        })
        .from(units)
        .where(and(eq(units.projectId, projectId), eq(units.position, i)));

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
