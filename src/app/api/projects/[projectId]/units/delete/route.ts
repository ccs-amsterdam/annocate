import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import { projects, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataDeleteBodySchema } from "../schemas";
import { reindexUnitPositions } from "../route";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: number }> }) {
  const params = await props.params;
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        await tx.delete(units).where(and(eq(units.projectId, params.projectId), inArray(units.unitId, body.ids)));
        await tx.update(projects).set({ unitsUpdated: new Date() }).where(eq(projects.id, params.projectId));
        await reindexUnitPositions(tx, params.projectId);
        return { success: true };
      });
    },
    req,
    bodySchema: UnitDataDeleteBodySchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
