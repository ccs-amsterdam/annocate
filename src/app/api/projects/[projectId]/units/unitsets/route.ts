import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import db, { units, layouts, unitsets, unitsetUnits } from "@/drizzle/schema";
import { count, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { UnitsetsCreateBodySchema, UnitsetsResponseSchema } from "./schemas";
import { z } from "zod";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      return await db
        .select({
          id: unitsets.id,
          name: unitsets.name,
          count: count(unitsetUnits.unitId),
        })
        .from(unitsets)
        .leftJoin(unitsetUnits, eq(unitsets.id, unitsetUnits.unitsetId))
        .where(eq(unitsets.projectId, projectId))
        .groupBy(unitsets.id);
    },
    req,
    responseSchema: z.array(UnitsetsResponseSchema),
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [unitset] = await db
        .insert(unitsets)
        .values({ projectId: params.projectId, name: body.name })
        .onConflictDoNothing()
        .returning();
      const unitIds = await db.select({ id: units.id }).from(units).where(inArray(units.externalId, body.unitIds));

      const unitsetUnitsValues = unitIds.map((unit) => ({
        unitId: unit.id,
        unitsetId: unitset.id,
      }));

      await db.insert(unitsetUnits).values(unitsetUnitsValues).onConflictDoNothing();
    },
    req,
    bodySchema: UnitsetsCreateBodySchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Codebook with the name "${body?.name}" already exists in this project`;
    },
  });
}
