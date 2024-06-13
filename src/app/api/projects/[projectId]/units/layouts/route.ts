import db, { layouts, units, users } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { hasMinProjectRole } from "@/app/api/authorization";
import {
  UnitLayoutsCreateBodySchema,
  UnitLayoutsCreateResponseSchema,
  UnitLayoutsResponseSchema,
  UnitLayoutsTableParamsSchema,
} from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    tableFunction: (email, urlParams) => {
      return db
        .select({
          id: layouts.id,
          name: layouts.name,
        })
        .from(layouts)
        .where(eq(layouts.projectId, params.projectId))
        .as("baseQuery");
    },
    paramsSchema: UnitLayoutsTableParamsSchema,
    responseSchema: UnitLayoutsResponseSchema,
    idColumn: "id",
    queryColumns: ["name"],
    projectId: params.projectId,

    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const overwrite = body.overwrite;
      delete body.overwrite;

      let query = db
        .insert(layouts)
        .values({ ...body, projectId: params.projectId })
        .$dynamic();

      if (overwrite) {
        query = query.onConflictDoUpdate({
          target: [layouts.projectId, layouts.name],
          set: { ...body },
        });
      }

      const [layout] = await query.returning();
      return layout;
    },
    req,
    bodySchema: UnitLayoutsCreateBodySchema,
    responseSchema: UnitLayoutsCreateResponseSchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, params) => {
      if (status === 409) return `Unit set ${params?.name} already exists`;
    },
  });
}
