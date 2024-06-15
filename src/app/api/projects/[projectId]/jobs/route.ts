import db, { projects, managers, users, unitsets, jobs } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { JobsTableParamsSchema, JobsUpdateSchema, JobsResponseSchema, JobsCreateSchema } from "./schemas";
import { hasMinProjectRole, hasMinRole } from "@/app/api/authorization";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    tableFunction: (email) =>
      db
        .select({
          id: jobs.id,
          name: jobs.name,
          unitsetId: jobs.unitsetId,
          unitsetName: sql<string>`${unitsets.name}`.as("unitsetName"),
          layoutId: jobs.layoutId,
          layoutName: sql<string>`${unitsets.name}`.as("layoutName"),
          codebookId: jobs.codebookId,
          codebookName: sql<string>`${unitsets.name}`.as("codebookName"),
        })
        .from(jobs)
        .where(eq(jobs.projectId, params.projectId))
        .as("baseQuery"),
    req,
    paramsSchema: JobsTableParamsSchema,
    idColumn: "id",
    queryColumns: ["name"],
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        await tx
          .insert(jobs)
          .values({ projectId: params.projectId, ...body })
          .returning();
      });
    },
    req,
    bodySchema: JobsCreateSchema,
    responseSchema: JobsResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
