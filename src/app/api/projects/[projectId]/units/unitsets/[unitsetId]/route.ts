import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { UnitsetResponseSchema, UnitsetsCreateBodySchema, UnitsetsUpdateBodySchema } from "../schemas";
import { hasMinProjectRole } from "@/app/api/authorization";
import db, { projects, units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { Unitset } from "@/app/types";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; unitsetId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      const unitsetColumns = await db
        .select({
          id: unitsets.id,
          name: unitsets.name,
          units: count(unitsetUnits.unitId).as("units"),
          column: sql<string>`jsonb_object_keys(${units.data})`.as("column"),
        })
        .from(units)
        .innerJoin(unitsetUnits, eq(units.id, unitsetUnits.unitId))
        .innerJoin(unitsets, eq(unitsetUnits.unitsetId, unitsets.id))
        .where(and(eq(unitsets.projectId, projectId), eq(unitsets.id, params.unitsetId)))
        .groupBy((t) => [t.id, t.column]);

      if (unitsetColumns.length === 0) return { message: "Unitset not found" };

      const unitset: Unitset = {
        id: unitsetColumns[0].id,
        name: unitsetColumns[0].name,
        units: unitsetColumns[0].units,
        columns: unitsetColumns.map((c) => ({ column: c.column })),
      };
      return unitset;
    },
    req,
    responseSchema: UnitsetResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number; unitsetId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        await tx.update(unitsets).set({ name: body.name }).where(eq(unitsets.id, params.unitsetId));
      });
    },
    req,
    bodySchema: UnitsetsUpdateBodySchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Unit layout with the name "${body?.name}" already exists in this project`;
    },
  });
}
