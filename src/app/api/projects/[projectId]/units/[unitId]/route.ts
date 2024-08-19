import db, { projects, units } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { NextRequest } from "next/server";
import { UnitDataRowSchema } from "../schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; unitId: string } }) {
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [unit] = await db
        .select({
          id: units.unitId,
          data: units.data,
        })
        .from(units)
        .where(and(eq(units.projectId, params.projectId), eq(units.unitId, params.unitId)));
      return unit;
    },
    req,
    responseSchema: UnitDataRowSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
