import db, { projects, managers, users, codebooks, jobs } from "@/drizzle/schema";
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
          codebookId: jobs.codebookId,
          codebookName: sql<string>`${codebooks.name}`.as("codebookName"),
        })
        .from(jobs)
        .where(eq(jobs.projectId, params.projectId))
        .leftJoin(codebooks, eq(jobs.codebookId, codebooks.id))
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
