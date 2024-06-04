import db, { unitSets, units, users } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { hasMinProjectRole } from "@/app/api/authorization";
import {
  UnitSetsCreateBodySchema,
  UnitSetsCreateResponseSchema,
  UnitSetsResponseSchema,
  UnitSetsTableParamsSchema,
} from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    tableFunction: (email, urlParams) =>
      db
        .select({
          projectId: unitSets.projectId,
          id: unitSets.id,
          name: unitSets.name,
        })
        .from(unitSets)
        .where(eq(unitSets.projectId, params.projectId))
        .as("baseQuery"),
    paramsSchema: UnitSetsTableParamsSchema,
    responseSchema: UnitSetsResponseSchema,
    idColumn: "id",
    queryColumns: ["name"],
  });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const overwrite = body.overwrite;
      delete body.overwrite;

      let query = db
        .insert(unitSets)
        .values({ ...body, projectId: params.projectId })
        .$dynamic();

      if (overwrite) {
        query = query.onConflictDoUpdate({
          target: [unitSets.projectId, unitSets.name],
          set: { ...body },
        });
      }

      const [unitSet] = await query.returning();
      return unitSet;
    },
    req,
    bodySchema: UnitSetsCreateBodySchema,
    responseSchema: UnitSetsCreateResponseSchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, params) => {
      if (status === 409) return `Unit set ${params?.name} already exists`;
    },
  });
}
