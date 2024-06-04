import db, { codebooks, projects, unitSets } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { UnitSetsResponseSchema, UnitSetsUpdateBodySchema } from "../schemas";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; unitsetId: number } }) {
  const { projectId, unitsetId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      const [unitset] = await db.select().from(unitSets).where(eq(unitSets.id, unitsetId));
      return unitset;
    },
    req,
    responseSchema: UnitSetsResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number; unitsetId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [unitset] = await db.update(unitSets).set(body).where(eq(unitSets.id, params.unitsetId)).returning();
      return unitset;
    },
    req,
    bodySchema: UnitSetsUpdateBodySchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Unit Set with the name "${body?.name}" already exists in this project`;
    },
  });
}
