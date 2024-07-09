import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import db, { units } from "@/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitDataDeleteBodySchema } from "../schemas";

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.delete(units).where(and(eq(units.projectId, params.projectId), inArray(units.externalId, body.ids)));
    },
    req,
    bodySchema: UnitDataDeleteBodySchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
