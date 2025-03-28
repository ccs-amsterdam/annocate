import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { jobs } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobCreateSchema, JobMetaResponseSchema, JobsTableParamsSchema } from "./schemas";
import { safeParams } from "@/functions/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = safeParams(await props.params);
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
    responseSchema: JobMetaResponseSchema,
    idColumn: "id",
    queryColumns: ["name"],
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = safeParams(await props.params);
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
