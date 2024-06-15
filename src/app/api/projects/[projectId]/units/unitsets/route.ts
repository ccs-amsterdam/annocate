import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { layouts, units, unitsets, unitsetUnits } from "@/drizzle/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { UnitsetsCreateBodySchema, UnitsetsResponseSchema, UnitsetTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createTableGet({
    tableFunction: (email, params) => {
      return db
        .select({
          id: unitsets.id,
          name: unitsets.name,
        })
        .from(unitsets)
        .where(eq(unitsets.projectId, projectId))
        .as("baseQuery");
    },
    req,
    paramsSchema: UnitsetTableParamsSchema,
    responseSchema: UnitsetsResponseSchema,
    projectId: params.projectId,
    queryColumns: ["name", "layout"],
    idColumn: "id",
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.insert(unitsets).values({ projectId: params.projectId, name: body.name }).returning();
    },
    req,
    bodySchema: UnitsetsCreateBodySchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
