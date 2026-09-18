import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { codebookNodes, jobs, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, count, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobResponseSchema, JobMetaResponseSchema, JobUpdateSchema } from "../schemas";
import { safeParams } from "@/functions/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [job] = await db
        .select({
          id: jobs.id,
          name: jobs.name,
          modified: jobs.modified,
          deployed: jobs.deployed,
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

export async function POST(req: Request, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);
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
    responseSchema: JobMetaResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
