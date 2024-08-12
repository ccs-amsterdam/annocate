import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import db, { jobs } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobResponseSchema, JobsResponseSchema, JobUpdateSchema } from "../schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; jobId: number } }) {
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [job] = await db
        .select({
          id: jobs.id,
          name: jobs.name,
          // units: sql<string[]>`array_agg(${units.unitId})`.as("units"),
          // codebookId: jobs.codebookId,
          // codebookName: sql<string>`${codebooks.name}`.as("codebookName"),
        })
        .from(jobs)
        .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, params.jobId)));
      return job;
    },
    req,
    responseSchema: JobResponseSchema,
    projectId: params.projectId,
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
    bodySchema: JobUpdateSchema,
    responseSchema: JobsResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
