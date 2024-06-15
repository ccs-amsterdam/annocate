import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { jobs, unitsets } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobsResponseSchema, JobsTableParamsSchema, JobsUpdateSchema } from "../schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; jobId: number } }) {
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
        .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, params.jobId)))
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

export async function POST(req: Request, { params }: { params: { projectId: number; jobId: number } }) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        await tx
          .update(jobs)
          .set(body)
          .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, params.jobId)))
          .returning();
      });
    },
    req,
    bodySchema: JobsUpdateSchema,
    responseSchema: JobsResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
