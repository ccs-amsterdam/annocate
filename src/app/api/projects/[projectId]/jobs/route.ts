import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import db, { jobs } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobCreateSchema, JobsResponseSchema, JobsTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    tableFunction: (email) =>
      db
        .select({
          id: jobs.id,
          name: jobs.name,
          modified: jobs.modified,
          deployed: jobs.deployed,
        })
        .from(jobs)
        .where(eq(jobs.projectId, params.projectId))
        .as("baseQuery"),
    req,
    paramsSchema: JobsTableParamsSchema,
    responseSchema: JobsResponseSchema,
    idColumn: "id",
    queryColumns: ["name"],
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        const [newJob] = await tx
          .insert(jobs)
          .values({ projectId: params.projectId, ...body })
          .returning();

        return newJob;
      });
    },
    req,
    bodySchema: JobCreateSchema,
    responseSchema: IdResponseSchema,
    errorFunction: (status, body) => {
      if (status === 409) return `A job with the name "${body?.name}" already exists in this project`;
    },
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
