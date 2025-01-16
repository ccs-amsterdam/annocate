import { projects, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, and } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { NextRequest } from "next/server";
import { UnitDataRowSchema } from "../schemas";
import { safeParams } from "@/functions/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; unitId: string }> }) {
  const params = safeParams(await props.params);
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [unit] = await db
        .select({
          id: units.externalId,
          data: units.data,
        })
        .from(units)
        .where(and(eq(units.projectId, params.projectId), eq(units.externalId, params.unitId)));
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
