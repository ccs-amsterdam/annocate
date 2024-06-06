import db, { codebooks, projects, layouts } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { UnitLayoutsResponseSchema, UnitLayoutsUpdateBodySchema } from "../schemas";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; layoutId: number } }) {
  const { projectId, layoutId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      const [unitlayout] = await db.select().from(layouts).where(eq(layouts.id, layoutId));
      return unitlayout;
    },
    req,
    responseSchema: UnitLayoutsResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number; layoutId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [unitlayout] = await db.update(layouts).set(body).where(eq(layouts.id, params.layoutId)).returning();
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
