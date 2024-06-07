import db, { codebooks, projects, layouts } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { UnitLayoutResponseSchema, UnitLayoutsResponseSchema, UnitLayoutsUpdateBodySchema } from "../schemas";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; layoutId: number } }) {
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [unitlayout] = await db
        .select({
          id: layouts.id,
          name: layouts.name,
          layout: layouts.layout,
        })
        .from(layouts)
        .where(and(eq(layouts.projectId, params.projectId), eq(layouts.id, params.layoutId)));
      return unitlayout;
    },
    req,
    responseSchema: UnitLayoutResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number; layoutId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [unitlayout] = await db
        .update(layouts)
        .set(body)
        .where(and(eq(layouts.projectId, params.projectId), eq(layouts.id, params.layoutId)))
        .returning();
      return unitlayout;
    },
    req,
    bodySchema: UnitLayoutsUpdateBodySchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Unit layout with the name "${body?.name}" already exists in this project`;
    },
  });
}
